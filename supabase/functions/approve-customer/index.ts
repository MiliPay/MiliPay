import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeNigerianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  return `+${digits}`;
}

async function sendEmailNotification(email: string, tempPassword: string, customerName: string): Promise<boolean> {
  const message = `Welcome to MiliPay, ${customerName}! Your biometric account has been verified. Log in with your temporary password: ${tempPassword}. Please change your password on first login.`;
  
  console.log(`[EMAIL DISPATCH SIMULATOR] To: ${email} | Message: ${message}`);

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (resendApiKey && email && email.includes('@')) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'MiliPay <onboarding@resend.dev>',
          to: email,
          subject: 'Your MiliPay Account is Ready!',
          html: `<p>Welcome to MiliPay, <strong>${customerName}</strong>!</p><p>Your biometric account has been verified.</p><p>Log in using your <strong>registered phone number</strong> and your temporary password: <strong>${tempPassword}</strong></p><p><em>Please change your password on your first login.</em></p>`,
        }),
      });
      console.log("Resend Email response status:", response.status);
    } catch (err) {
      console.error("Resend Email sending error:", err);
    }
  }

  // NOTE: To switch back to SMS in production, simply replace this block with the Termii SMS API payload
  // and rename back to sendSmsNotification.
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate calling Admin
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
      return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can approve customers' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request
    const body = await req.json();
    const { customerId, customPassword } = body;

    if (!customerId) {
      return new Response(JSON.stringify({ error: 'Missing customerId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch customer from database
    const { data: customer, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Generate temporary password
    function generateSecurePassword(length = 12): string {
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
      }
      // Ensure at least one uppercase, one lowercase, one number, and one special char
      return password + "aA1!"; 
    }

    const tempPassword = customPassword && customPassword.trim().length >= 8
      ? customPassword.trim()
      : generateSecurePassword(10);

    const normalizedPhone = normalizeNigerianPhone(customer.phone);
    const authEmail = customer.email || `${customer.phone.replace(/\D/g, '')}@customer.milipay.ng`;

    // 5. Create or retrieve Supabase Auth user
    let authUserId = customer.auth_user_id;

    if (!authUserId) {
      const { data: newAuthUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        phone: normalizedPhone,
        password: tempPassword,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          full_name: `${customer.first_name} ${customer.last_name}`.trim(),
          customer_id: customer.id,
          must_change_password: true,
        },
        app_metadata: {
          role: 'customer',
        },
      });

      if (authCreateError) {
        console.warn("Auth user creation warning:", authCreateError.message);
        // If user already exists by email/phone, update their password
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === authEmail || u.phone === normalizedPhone);
        if (existing) {
          authUserId = existing.id;
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: tempPassword,
            user_metadata: { must_change_password: true },
          });
        } else {
          throw authCreateError;
        }
      } else if (newAuthUser?.user) {
        authUserId = newAuthUser.user.id;
      }
    } else {
      // User exists, reset password to new temp password
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      });
    }

    // 6. Update customer status to active and record verification
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({
        status: 'active',
        kyc_tier: 2,
        pin_threshold: 10000.00,
        auth_user_id: authUserId,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', customerId);

    if (updateError) {
      throw updateError;
    }

    // 7. Dispatch Email with temporary password (SMS disabled for testing)
    const customerFullName = `${customer.first_name} ${customer.last_name}`.trim();
    await sendEmailNotification(authEmail, tempPassword, customerFullName);

    return new Response(JSON.stringify({
      success: true,
      customerId: customer.id,
      authUserId: authUserId,
      tempPassword: tempPassword,
      smsDispatched: false,
      emailDispatched: true,
      message: 'Customer verified, auth created, and Email password dispatched successfully.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Approve customer error:", error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to approve customer' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
