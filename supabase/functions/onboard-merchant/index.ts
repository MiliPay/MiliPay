import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY') ?? '';

    // Verify calling staff identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (!user || authError) {
      throw new Error(`Unauthorized caller: ${authError?.message || 'Invalid session'}`);
    }

    // Admin client for DB queries bypassing RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceRole);

    // Verify staff profile role
    const { data: staffProfile, error: staffError } = await adminClient
      .from('staff_profiles')
      .select('id, role, full_name')
      .eq('id', user.id)
      .single();

    if (staffError || !staffProfile) {
      throw new Error("Caller is not recognized as a registered staff member");
    }

    if (!['agent', 'admin', 'super_admin'].includes(staffProfile.role)) {
      throw new Error("Access denied: Only agents and administrators can onboard merchants");
    }

    const body = await req.json();
    const {
      businessName,
      category,
      address,
      state = "Lagos",
      cacRcNumber,
      directorName,
      directorPhone,
      directorBvn,
      email,
      password,
      settlementBankName,
      settlementBankCode,
      settlementAccountNumber,
      settlementAccountName,
      platformFeePercent = 1.50,
      settlementSchedule = "instant",
      terminalId,
      deviceSerialNumber,
      deviceModel = "HFSecurity HP605PV",
    } = body;

    if (!businessName || !category || !address || !directorName || !directorPhone) {
      throw new Error("Missing required business or director details");
    }

    if (!settlementBankName || !settlementBankCode || !settlementAccountNumber) {
      throw new Error("Missing settlement bank account details");
    }

    let verifiedAccountName = settlementAccountName;
    let monoSubaccountId = `mono_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Call Mono Account Lookup if secret key is configured
    if (monoSecretKey && monoSecretKey.trim().length > 0 && !monoSecretKey.includes("placeholder")) {
      try {
        const lookupRes = await fetch("https://api.withmono.com/v2/lookup/account", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "mono-sec-key": monoSecretKey,
          },
          body: JSON.stringify({
            account_number: settlementAccountNumber,
            bank_code: settlementBankCode,
          }),
        });

        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          verifiedAccountName = lookupData?.data?.name || lookupData?.name || verifiedAccountName;
        }
      } catch (monoErr) {
        console.warn("Mono lookup non-fatal fallback:", monoErr);
      }
    }

    // Provision Merchant Auth Login Account
    const cleanEmail = email?.trim().toLowerCase();
    const defaultPassword = password || "Password12$";
    let authUserId: string | null = null;

    if (cleanEmail && cleanEmail.includes("@")) {
      try {
        const { data: newAuth, error: authErr } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            full_name: directorName,
            business_name: businessName,
            must_change_password: true,
          },
          app_metadata: {
            role: 'merchant',
          },
        });

        if (!authErr && newAuth?.user) {
          authUserId = newAuth.user.id;
        } else if (authErr && authErr.message.includes("already been registered")) {
          // If already registered, fetch user ID and update role
          const { data: listRes } = await adminClient.auth.admin.listUsers();
          const existing = listRes?.users?.find(u => u.email?.toLowerCase() === cleanEmail);
          if (existing) {
            authUserId = existing.id;
            await adminClient.auth.admin.updateUserById(existing.id, {
              password: defaultPassword,
              app_metadata: { role: 'merchant' },
            });
          }
        }
      } catch (authCreateErr) {
        console.warn("Auth user creation non-fatal:", authCreateErr);
      }
    }

    // 1. Insert Merchant
    const { data: merchant, error: merchantError } = await adminClient
      .from('merchants')
      .insert({
        business_name: businessName,
        category: category,
        address: address,
        state: state,
        cac_rc_number: cacRcNumber || null,
        director_name: directorName,
        director_phone: directorPhone,
        director_bvn: directorBvn || null,
        email: cleanEmail || null,
        auth_user_id: authUserId,
        settlement_bank_name: settlementBankName,
        settlement_bank_code: settlementBankCode,
        settlement_account_number: settlementAccountNumber,
        settlement_account_name: verifiedAccountName || businessName,
        mono_subaccount_id: monoSubaccountId,
        platform_fee_percent: platformFeePercent,
        settlement_schedule: settlementSchedule,
        status: 'active',
        onboarded_by: staffProfile.id,
      })
      .select()
      .single();

    if (merchantError) {
      throw new Error(`Failed to insert merchant: ${merchantError.message}`);
    }

    // 2. Insert POS Terminal if specified
    let terminal = null;
    if (terminalId && deviceSerialNumber) {
      const { data: createdTerminal, error: terminalError } = await adminClient
        .from('pos_terminals')
        .insert({
          terminal_id: terminalId,
          merchant_id: merchant.id,
          device_serial_number: deviceSerialNumber,
          device_model: deviceModel,
          is_active: true,
          assigned_by: staffProfile.id,
        })
        .select()
        .single();

      if (terminalError) {
        console.warn("Terminal creation warning:", terminalError.message);
      } else {
        terminal = createdTerminal;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        merchant,
        terminal,
        credentials: cleanEmail ? {
          email: cleanEmail,
          tempPassword: defaultPassword,
          portalUrl: "https://merchant.milipayz.com",
        } : null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Failed to onboard merchant",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
