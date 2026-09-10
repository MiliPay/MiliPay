import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { monoCode } = await req.json()

    if (!monoCode) {
      throw new Error("Mono auth code is required");
    }

    // --- Auth: verify the user's identity ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error("Missing Authorization header from mobile app");
    }
    const token = authHeader.replace('Bearer ', '').trim();

    // User client: only used to verify who is calling
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (!user) {
      throw new Error(`Unauthorized User. Auth Error: ${authError?.message || 'Unknown'}`);
    }

    // Admin client: uses service role key to bypass RLS for DB writes
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Enforce maximum 3 active bank accounts limit
    const { count: activeCount } = await adminClient
      .from('linked_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (activeCount !== null && activeCount >= 3) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Maximum limit reached. You can only link up to 3 bank accounts. Please remove an existing account first." 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- Mono API: exchange code for account details ---
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY') ?? '';
    
    // 1. Exchange the auth code for an account ID
    const authRes = await fetch('https://api.withmono.com/v2/accounts/auth', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'mono-sec-key': monoSecretKey
      },
      body: JSON.stringify({ code: monoCode })
    });
    
    if (!authRes.ok) {
      const err = await authRes.text();
      throw new Error(`Mono Auth Failed (${authRes.status}): ${err}`);
    }
    
    const authData = await authRes.json();
    // v2 wraps in { data: { id: "..." } }
    const accountId = authData?.data?.id || authData?.id;
    if (!accountId) {
      throw new Error(`Could not extract account ID from Mono: ${JSON.stringify(authData)}`);
    }

    // 2. Fetch account details
    const accountRes = await fetch(`https://api.withmono.com/v2/accounts/${accountId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'mono-sec-key': monoSecretKey
      }
    });

    if (!accountRes.ok) {
      const err = await accountRes.text();
      throw new Error(`Mono Account Details Failed (${accountRes.status}): ${err}`);
    }

    const accountData = await accountRes.json();
    console.log("Mono Account Response:", JSON.stringify(accountData));
    
    // v2 structure: { data: { account: { name, account_number, balance, institution: { name } }, meta: {...} } }
    const acct = accountData?.data?.account || accountData?.data || accountData;
    const bankName = acct.institution?.name || accountData?.data?.meta?.data_status || 'Unknown Bank';
    const accountNumber = acct.account_number || acct.accountNumber || '0000000000';
    const accountName = acct.name || 'Unknown User';
    const balance = acct.balance || 0;

    // --- Database: save everything using admin client (bypasses RLS) ---

    // 3. Save linked account (FK now references auth.users directly)
    const { data, error } = await adminClient.from('linked_accounts').insert({
      user_id: user.id,
      mono_account_id: accountId,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      balance: balance,
    }).select().single();

    if (error) {
      throw new Error(`Failed to save linked account: ${error.message}`);
    }

    return new Response(JSON.stringify({ success: true, account: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
