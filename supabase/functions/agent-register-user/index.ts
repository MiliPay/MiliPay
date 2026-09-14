import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

serve(async (req) => {
  const { phone, bvn, nin, email } = await req.json()

  // Here an Admin or Agent is creating the user.
  // Validate Agent Auth if necessary.

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Generate random password
  const randomPassword = Math.random().toString(36).slice(-10)

  // 2. Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    phone: phone,
    password: randomPassword,
    email: email,
    email_confirm: true,
    phone_confirm: true
  })

  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), { status: 400 })
  }

  // 3. Insert into public.users
  const { error: dbError } = await supabaseAdmin.from('users').insert({
    id: authUser.user.id,
    phone: phone,
    email: email,
    bvn: bvn,
    nin: nin,
    kyc_tier: 2,
    pin_threshold: 10000.00,
    is_verified: true
  })

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), { status: 400 })
  }

  // 4. Send SMS to user with password using Termii (Placeholder)
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
