-- The merchant portal's second step (agreed 2026-10-20): after the
-- password, a code by SMS, a call or email to the account's own phone or
-- email. Enforced here, not just in the browser: until this sign-in session
-- has passed the code, a merchant sees nothing in merchants, transactions or
-- pos_terminals. Staff, customers and the POS terminal (service role) are
-- unaffected.

CREATE TABLE IF NOT EXISTS public.merchant_sign_in_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  -- The Supabase Auth session this check belongs to (the JWT's session_id).
  session_id text NOT NULL,
  -- HMAC of the code, bound to this row; never the code.
  code_hash text,
  sent_at timestamptz,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  resends smallint NOT NULL DEFAULT 0,
  verified_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_sign_in_codes_session ON public.merchant_sign_in_codes (user_id, session_id);

ALTER TABLE public.merchant_sign_in_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_sign_in_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_sign_in_codes TO service_role;

-- True unless the caller is a merchant whose session hasn't passed the code.
CREATE OR REPLACE FUNCTION public.merchant_second_step_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.merchants m
            WHERE m.auth_user_id = auth.uid()
               OR m.id::text = coalesce(auth.jwt() -> 'app_metadata' ->> 'merchant_id', '')
         )
      OR EXISTS (
           SELECT 1 FROM public.merchant_sign_in_codes c
            WHERE c.user_id = auth.uid()
              AND c.session_id = coalesce(auth.jwt() ->> 'session_id', '')
              AND c.verified_at IS NOT NULL
         );
$$;
REVOKE ALL ON FUNCTION public.merchant_second_step_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_second_step_ok() TO authenticated, service_role;

DROP POLICY IF EXISTS merchants_second_step ON public.merchants;
CREATE POLICY merchants_second_step ON public.merchants AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.merchant_second_step_ok()));
DROP POLICY IF EXISTS transactions_second_step ON public.transactions;
CREATE POLICY transactions_second_step ON public.transactions AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.merchant_second_step_ok()));
DROP POLICY IF EXISTS pos_terminals_second_step ON public.pos_terminals;
CREATE POLICY pos_terminals_second_step ON public.pos_terminals AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.merchant_second_step_ok()));

-- Merchants made before onboarding set the role in the sign-in token would
-- otherwise be identified by reading their merchants row, which the policy
-- above now hides until the code is in. Give them the role directly.
UPDATE auth.users u
   SET raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"role":"merchant"}'::jsonb
  FROM public.merchants m
 WHERE m.auth_user_id = u.id
   AND coalesce(u.raw_app_meta_data ->> 'role', '') = '';
