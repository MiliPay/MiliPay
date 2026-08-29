import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // SUPABASE_URL is automatically provided by the runtime.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // We will use a custom name for the service role key to bypass the CLI restriction
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get the user that made the request to ensure they are an admin
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      console.log("Missing Authorization header");
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    
    console.log("Authenticating token...");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.log("User authentication failed:", userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = user.app_metadata?.role;
    console.log("Caller authenticated. Role:", callerRole);
    if (callerRole !== 'admin' && callerRole !== 'super_admin' && callerRole !== 'superAdmin') {
      console.log("Forbidden role:", callerRole);
      return new Response(JSON.stringify({ error: 'Forbidden: Only admins can create staff' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request body
    console.log("Parsing body...");
    const body = await req.json();
    console.log("Body:", body);
    const { fullName, email, phone, nin, role, state, password } = body;

    if (!email || !fullName || !phone || !role || !nin) {
      console.log("Missing required fields");
      return new Response(JSON.stringify({ error: 'Missing required fields: fullName, email, phone, nin, and role are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (nin.length !== 11) {
      return new Response(JSON.stringify({ error: 'National Identification Number (NIN) must be exactly 11 digits.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Create the user in Auth with secure temporary password
    console.log("Creating user in Auth...");
    function generateSecurePassword(length = 12): string {
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
      }
      return password + "aA1!"; 
    }
    
    const tempPassword = password && password.trim().length >= 8 
      ? password.trim() 
      : generateSecurePassword(10);
    
    const ninLast4 = nin.slice(-4);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        nin_last_4: ninLast4,
        must_change_password: true,
      },
      app_metadata: {
        role: role,
      }
    });

    if (createError) {
      console.log("Create user error:", createError);
      throw createError;
    }

    // 4. Insert into staff_profiles table
    console.log("Inserting profile...");
    const { error: profileError } = await supabaseAdmin
      .from('staff_profiles')
      .insert({
        id: newUser.user.id,
        full_name: fullName,
        email: email,
        phone: phone,
        nin: nin,
        nin_last_4: ninLast4,
        role: role,
        state: state || null,
        status: 'active'
      });

    if (profileError) {
      console.log("Insert profile error:", profileError);
      // Rollback auth user creation if profile fails (best effort)
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw profileError;
    }

    console.log("Success!");
    return new Response(JSON.stringify({ 
      user: newUser.user, 
      tempPassword: tempPassword,
      message: 'Staff created successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.log("Catch block error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
