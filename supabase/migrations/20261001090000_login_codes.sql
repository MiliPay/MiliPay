-- Sign-in by SMS code (redesign phase 6).
--
-- A verified customer opens the app, enters the phone number they gave their
-- agent and gets a 6-digit code. The login-code Edge Function owns the whole
-- exchange; this table is its memory. Nothing here is readable or writable by
-- a client: codes are stored only as an HMAC, and the table has RLS on with no
-- policies, so only the service role reaches it.
--
--   needs_pin        the account was already set up (PIN set, onboarding
--                    done), so the code alone is not enough: the customer
--                    must also give their PIN before a session is issued.
--                    An SMS code on its own would hand the account to anyone
--                    holding a swapped SIM.
--   code_verified_at the code was right; for needs_pin rows the PIN is next.
--   consumed_at      a session was issued; the row can never be used again.

CREATE TABLE IF NOT EXISTS public.login_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  auth_user_id     uuid NOT NULL,
  phone            text NOT NULL,
  code_hash        text,
  sent_at          timestamptz,
  expires_at       timestamptz NOT NULL,
  attempts         integer NOT NULL DEFAULT 0,
  resends          integer NOT NULL DEFAULT 0,
  needs_pin        boolean NOT NULL DEFAULT false,
  code_verified_at timestamptz,
  consumed_at      timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_codes_customer_open_idx
  ON public.login_codes (customer_id, created_at DESC)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE public.login_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_codes FROM anon, authenticated;
GRANT ALL ON public.login_codes TO service_role;

COMMENT ON TABLE public.login_codes IS
  'SMS sign-in codes (login-code Edge Function). Service role only; codes stored as HMAC.';
