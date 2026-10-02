import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { monoAppTag } from "../_shared/mono-app-tag.ts"
import { namesMatch } from "../_shared/signup.ts"

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
    // The full Mono payload carries the customer's account number, name and
    // balance. It used to be written to the function log in full.
    
    // v2 structure: { data: { account: { name, account_number, balance, institution: { name } }, meta: {...} } }
    const acct = accountData?.data?.account || accountData?.data || accountData;
    const bankName = acct.institution?.name || accountData?.data?.meta?.data_status || 'Unknown Bank';
    const accountNumber = acct.account_number || acct.accountNumber || '0000000000';
    const accountName = acct.name || 'Unknown User';
    // Quick pay needs the bank code beside the account number; keeping it
    // here saves asking Mono again later. Spelled both ways in Mono's payloads.
    const rawBankCode = acct.institution?.bank_code ?? acct.institution?.bankCode;
    const bankCode = typeof rawBankCode === 'string' && rawBankCode.trim() ? rawBankCode.trim() : null;

    // Mono reports balances in kobo. cached_balance is Naira numeric(12,2)
    // per the project currency invariant, so convert at the boundary rather
    // than letting kobo leak into the database.
    //
    // This figure is DISPLAY ONLY and goes stale the moment it is taken. It
    // used to be the thing vtu-service spent from, which meant MiliPay was
    // vending real airtime against a number copied out of a read-only API.
    const balanceNgn = Math.round((Number(acct.balance) || 0)) / 100;

    // --- Whose account is it? ---
    // A customer who signed up themselves was verified by their NIN and a
    // selfie, so the account they pay from must be in that same name. Without
    // this, someone verified as themselves could pay out of anyone's account
    // they could log in to. (Agent-enrolled customers are checked in person.)
    const { data: customer } = await adminClient
      .from('customers')
      .select('first_name, last_name, signup_source')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (customer?.signup_source === 'self' &&
        !namesMatch({ firstName: customer.first_name ?? '', lastName: customer.last_name ?? '' }, accountName)) {
      // Nothing is stored, and Mono is told to forget the link.
      await fetch(`https://api.withmono.com/v2/accounts/${accountId}/unlink`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'mono-sec-key': monoSecretKey },
      }).catch(() => {});
      return new Response(JSON.stringify({
        success: false,
        code: 'NAME_MISMATCH',
        error: "This account isn't in your name. You can only link accounts in your own name.",
        accountName,
        customerName: `${customer.first_name} ${customer.last_name}`.trim(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Database: save everything using admin client (bypasses RLS) ---

    // 3. Save linked account (FK now references auth.users directly)
    const { data, error } = await adminClient.from('linked_accounts').insert({
      user_id: user.id,
      mono_account_id: accountId,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      cached_balance: balanceNgn,
      balance_as_of: new Date().toISOString(),
      bank_code: bankCode,
      // Which Mono app linked it. DirectPay can skip Mono's bank picker only
      // for an account linked through the app taking the payment, and this is
      // how vtu-service tells. Not secret: see _shared/mono-app-tag.ts.
      mono_app_tag: await monoAppTag(monoSecretKey),
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
