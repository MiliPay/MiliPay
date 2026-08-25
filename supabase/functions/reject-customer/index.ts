import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendRejectionSms(phone: string, customerName: string, reason: string): Promise<boolean> {
  const message = `Hello ${customerName}, your MiliPay biometric registration was not approved. Reason: ${reason}. Please visit your local agent or contact support to rectify this.`;
  
  console.log(`[REJECTION SMS DISPATCH] To: ${phone} | Message: ${message}`);

  const termiiApiKey = Deno.env.get('TERMII_API_KEY');
  if (termiiApiKey) {
    try {
      const response = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: 'MiliPay',
          sms: message,
          type: 'plain',
          channel: 'generic',
          api_key: termiiApiKey,
        }),
      });
      console.log("Termii rejection SMS status:", response.status);
    } catch (err) {
      console.error("Termii SMS sending error:", err);
    }
  }

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

    // Authenticate Admin
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
      return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can reject customers' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { customerId, reason } = body;

    if (!customerId) {
      return new Response(JSON.stringify({ error: 'Missing customerId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rejectionReason = reason || 'Customer did not satisfy biometric or NIN identity verification requirements.';

    // Fetch customer to get phone and name for SMS
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('first_name, last_name, phone')
      .eq('id', customerId)
      .single();

    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({
        status: 'rejected',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', customerId);

    if (updateError) {
      throw updateError;
    }

    // Send Rejection SMS
    if (customer?.phone) {
      const customerFullName = `${customer.first_name} ${customer.last_name}`.trim();
      await sendRejectionSms(customer.phone, customerFullName, rejectionReason);
    }

    return new Response(JSON.stringify({
      success: true,
      customerId: customerId,
      status: 'rejected',
      smsDispatched: true,
      message: 'Customer enrollment has been rejected and SMS notification dispatched.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Reject customer error:", error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to reject customer' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
