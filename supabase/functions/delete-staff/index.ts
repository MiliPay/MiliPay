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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get and authenticate calling admin
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = user.app_metadata?.role;
    if (callerRole !== 'admin' && callerRole !== 'super_admin' && callerRole !== 'superAdmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can delete staff accounts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse staffId from body
    const body = await req.json();
    const { staffId } = body;

    if (!staffId) {
      return new Response(JSON.stringify({ error: 'Missing required field: staffId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Protect against self-deletion
    if (user.id === staffId) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own administrative account.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Delete from public.staff_profiles
    const { error: profileDeleteError } = await supabaseAdmin
      .from('staff_profiles')
      .delete()
      .eq('id', staffId);

    if (profileDeleteError) {
      console.error("Error deleting from staff_profiles:", profileDeleteError);
    }

    // 4. Delete user permanently from auth.users
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(staffId);

    if (authDeleteError) {
      console.error("Error deleting from auth.users:", authDeleteError);
      throw authDeleteError;
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Staff user permanently deleted from database and authentication service',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Delete staff error:", error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to delete staff member' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
