-- POS terminal app (merchant-portal/design_handoff_pos): the till logs in
-- once with the merchant's phone and password, then cashiers unlock it with
-- their own 4-digit PIN. Payments record which cashier took them and how the
-- customer paid; refunds need a supervisor's PIN and are requests that
-- operations completes (palm payments don't move money back by themselves).
--
-- Everything here is written and read by the `pos` Edge Function with the
-- service role. No browser or app reaches these tables directly.

-- ── Terminal pairing ────────────────────────────────────────────────────
-- pos_terminals.terminal_api_key_hash already exists (unused until now): it
-- holds the hash of the device token the terminal gets at first login.
ALTER TABLE public.pos_terminals
  ADD COLUMN IF NOT EXISTS paired_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_receipts boolean NOT NULL DEFAULT true;

-- ── Cashiers ────────────────────────────────────────────────────────────
-- Per merchant, so every till of a shop knows the same people. The owner is
-- created as the first supervisor at the terminal's first login.
CREATE TABLE IF NOT EXISTS public.pos_cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  is_supervisor boolean NOT NULL DEFAULT false,
  is_owner boolean NOT NULL DEFAULT false,
  pin_hash text,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_cashiers_one_owner ON public.pos_cashiers (merchant_id) WHERE is_owner;
CREATE INDEX IF NOT EXISTS pos_cashiers_merchant_idx ON public.pos_cashiers (merchant_id) WHERE active;
ALTER TABLE public.pos_cashiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_cashiers FROM anon, authenticated;
GRANT ALL ON public.pos_cashiers TO service_role;

-- ── What each payment was ───────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES public.pos_cashiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS used_pin boolean;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('palm', 'qr', 'card'));
CREATE INDEX IF NOT EXISTS transactions_terminal_day_idx ON public.transactions (terminal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_cashier_idx ON public.transactions (cashier_id);

-- ── Refund requests from the till ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  terminal_id text,
  amount numeric(12, 2) NOT NULL,
  requested_by uuid REFERENCES public.pos_cashiers(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.pos_cashiers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_refunds_one_per_tx ON public.pos_refunds (transaction_id);
CREATE INDEX IF NOT EXISTS pos_refunds_merchant_idx ON public.pos_refunds (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_refunds_requested_idx ON public.pos_refunds (requested_by);
CREATE INDEX IF NOT EXISTS pos_refunds_approved_idx ON public.pos_refunds (approved_by);
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_refunds FROM anon, authenticated;
GRANT ALL ON public.pos_refunds TO service_role;
