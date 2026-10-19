-- A terminal signing in for a merchant it hasn't been paired with (a new
-- terminal, or one moved from another merchant) needs a code sent to the
-- merchant's phone as well as the password, so a stolen password alone
-- can't switch on a terminal somewhere else (agreed 2026-10-20).

-- Which merchant the terminal was last paired for. Terminals already paired
-- keep their pairing, so nobody set up today is interrupted.
ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS paired_merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL;
UPDATE public.pos_terminals SET paired_merchant_id = merchant_id
 WHERE paired_at IS NOT NULL AND paired_merchant_id IS NULL AND merchant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pos_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES public.pos_terminals(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  serial text NOT NULL,
  phone text NOT NULL,
  -- HMAC of the code, bound to this row; never the code.
  code_hash text,
  sent_at timestamptz,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  resends smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_pairing_codes_terminal ON public.pos_pairing_codes (terminal_id, created_at DESC);

-- Only the pos Edge Function (service role) reads or writes these.
ALTER TABLE public.pos_pairing_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_pairing_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pos_pairing_codes TO service_role;
