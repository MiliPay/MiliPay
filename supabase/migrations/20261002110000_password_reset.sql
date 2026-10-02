-- Me › Security › Change password, and "Forgot your current password?"
-- (design handoff, screen 9b). The password Edge Function owns both; this
-- table holds the reset codes. Service role only; the code and the reset
-- token are stored as HMACs.

CREATE TABLE IF NOT EXISTS public.password_resets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     uuid NOT NULL,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  phone            text NOT NULL,
  code_hash        text,
  sent_at          timestamptz,
  expires_at       timestamptz NOT NULL,
  attempts         integer NOT NULL DEFAULT 0,
  resends          integer NOT NULL DEFAULT 0,
  verified_at      timestamptz,
  token_hash       text,
  token_expires_at timestamptz,
  used_at          timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON public.password_resets (auth_user_id, created_at DESC);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_resets FROM anon, authenticated;
GRANT ALL ON public.password_resets TO service_role;

COMMENT ON TABLE public.password_resets IS
  'Password reset codes (password Edge Function). Service role only; code and token stored as HMAC.';
