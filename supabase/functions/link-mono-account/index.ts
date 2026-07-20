import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

serve(async (req) => {
  const { monoCode } = await req.json()

  const authHeader = req.headers.get('Authorization')!
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // 1. Call Mono API with the code to get the account id
  // const monoResponse = await fetch('https://api.withmono.com/account/auth', { ... })
  
  // 2. Fetch the actual account details from Mono
  
  // 3. Save to Linked Accounts
  const { error } = await supabaseClient.from('linked_accounts').insert({
    user_id: user.id,
    mono_account_id: 'dummy_mono_id', // From Mono
    bank_name: 'GTBank',
    account_number: 'encrypted_0123456789',
    account_name: 'John Doe',
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
