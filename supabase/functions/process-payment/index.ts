import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

serve(async (req) => {
  const { amount, accountId, merchantId, pin } = await req.json()

  // 1. Verify Auth
  const authHeader = req.headers.get('Authorization')!
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // 2. Fetch User to verify PIN
  const { data: userData } = await supabaseClient
    .from('users')
    .select('pin_hash')
    .eq('id', user.id)
    .single()
    
  // Note: Deno has bcrypt via external modules, or use Web Crypto API depending on the exact hashing used.
  // For now, this is a placeholder for bcrypt comparison.
  // const isValidPin = await bcrypt.compare(pin, userData.pin_hash);

  // 3. Call Flutterwave (Placeholder)
  // const fwResponse = await fetch('https://api.flutterwave.com/v3/charges', { ... })

  // 4. Save Transaction using Service Role Key
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  await supabaseAdmin.from('transactions').insert({
    user_id: user.id,
    merchant_id: merchantId,
    amount: amount,
    account_used: accountId,
    status: 'success',
    reference: 'FLW-TEST-' + Date.now(),
  })

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
