-- Migration: 20260922000000_vtu_payment_rail.sql
-- Description:
--   Phase 1 of the quick-services rework. Three things:
--
--   1. Close two live exploits on public.linked_accounts.
--   2. Retire the fictional balance ledger.
--   3. Give transactions the state machine and the columns a real payment
--      rail needs.
--
-- ── 1. The exploits ──────────────────────────────────────────────────────
--
-- `authenticated` holds INSERT and UPDATE column grants on linked_accounts,
-- and the policies are:
--
--   INSERT  WITH CHECK (auth.uid() = user_id)
--   UPDATE  USING      (auth.uid() = user_id)   -- no WITH CHECK
--
-- Since linked_accounts.balance was the thing vtu-service spent, a customer
-- could simply PATCH their own row and set it to anything, or INSERT a
-- fabricated bank account with any balance they liked. One request, no
-- hardware, no Mono involvement. That is a more direct hole than the
-- relink-to-reset one, and it is open right now.
--
-- Every legitimate write already goes through an Edge Function on the service
-- role or through unlink_bank_account (SECURITY DEFINER). The only client
-- writes in the tree are two fallbacks that run when an RPC fails, and both
-- are removed in this same change. So INSERT/UPDATE/DELETE are revoked from
-- `authenticated` outright.
--
-- ── 2. The fictional ledger ──────────────────────────────────────────────
--
-- linked_accounts.balance is a copy of the customer's real bank balance,
-- taken once from Mono's READ-ONLY API at link time and never reconciled.
-- debit_linked_account decremented that copy and vtu-service bought real
-- airtime against it. The money never moved.
--
-- Under the new model — Mono debits the customer's bank per transaction —
-- there is no local balance to spend at all: the bank declines if the funds
-- are not there. So the two ledger functions are dropped, and the column is
-- renamed to cached_balance to make its status unmistakable. It is a display
-- figure with an as-of timestamp, and nothing may authorise spending from it.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Lock down linked_accounts
-- ─────────────────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE ON public.linked_accounts FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can insert their own linked accounts" ON public.linked_accounts;
DROP POLICY IF EXISTS "Users can update their own linked accounts" ON public.linked_accounts;

-- SELECT policies are deliberately left as they are: a customer seeing their
-- own linked accounts, and staff seeing all of them, are both correct.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Retire the fictional ledger
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.debit_linked_account(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.credit_linked_account(UUID, NUMERIC);

ALTER TABLE public.linked_accounts RENAME COLUMN balance TO cached_balance;

ALTER TABLE public.linked_accounts
  ADD COLUMN IF NOT EXISTS balance_as_of TIMESTAMPTZ;

COMMENT ON COLUMN public.linked_accounts.cached_balance IS
  'DISPLAY ONLY. A snapshot of the bank balance as of balance_as_of. Never a spending source: money moves by Mono debit, and the bank decides whether there are funds.';

COMMENT ON COLUMN public.linked_accounts.balance_as_of IS
  'When cached_balance was last read from the provider. A NULL here means the figure has never been refreshed since linking.';

-- Existing rows were snapshotted at link time.
UPDATE public.linked_accounts
SET balance_as_of = created_at
WHERE balance_as_of IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. transactions: real columns
-- ─────────────────────────────────────────────────────────────────────────
-- Everything about a purchase used to be crammed into merchant_name as a
-- string, including electricity tokens ("MTN Airtime [Token: 1234-5678]").
-- Nothing could be reconciled against a provider statement.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS service_type        TEXT,
  ADD COLUMN IF NOT EXISTS provider            TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary         TEXT,
  ADD COLUMN IF NOT EXISTS variation_code      TEXT,
  ADD COLUMN IF NOT EXISTS base_amount         NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS fee_amount          NUMERIC(12, 2),
  -- Which of the two gateways actually fulfilled it. BigiSub is SME data on
  -- MTN and Airtel only; everything else is VTPass.
  ADD COLUMN IF NOT EXISTS fulfilment_provider TEXT,
  ADD COLUMN IF NOT EXISTS operator_reference  TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider    TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference   TEXT,
  ADD COLUMN IF NOT EXISTS mono_payment_id     TEXT,
  ADD COLUMN IF NOT EXISTS token               TEXT,
  ADD COLUMN IF NOT EXISTS units               TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason      TEXT,
  ADD COLUMN IF NOT EXISTS initiated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfilled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Idempotency is only real if the database enforces it. A retry must collide,
-- not create a second charge.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_key
  ON public.transactions (reference);

CREATE INDEX IF NOT EXISTS transactions_user_recent_idx
  ON public.transactions (user_id, created_at DESC);

-- The reconciliation job hunts for these two.
CREATE INDEX IF NOT EXISTS transactions_unsettled_idx
  ON public.transactions (status, updated_at)
  WHERE status IN ('initiated', 'paid', 'fulfilling', 'fulfilment_pending', 'refund_pending');

-- Migrate the old vocabulary before constraining it. All 14 existing rows are
-- completed merchant payments.
UPDATE public.transactions SET status = 'delivered' WHERE status = 'success';
UPDATE public.transactions SET status = 'fulfilment_failed' WHERE status = 'failed';

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (
  status IN (
    'initiated',           -- row exists, no money has moved yet
    'payment_failed',      -- the bank declined; terminal
    'paid',                -- Mono confirmed the debit
    'fulfilling',          -- operator call in flight
    'fulfilment_pending',  -- operator said 099, or timed out; requery
    'delivered',           -- terminal, success
    'fulfilment_failed',   -- operator declined after we took the money
    'refund_pending',      -- in the refund queue
    'refunded',            -- terminal
    'refund_failed',       -- needs a human; terminal until resolved
    'quarantined'          -- webhook disagreed with us; needs a human
  )
);

COMMENT ON COLUMN public.transactions.status IS
  'State machine. Money is confirmed (paid) before irreversible value is dispensed (fulfilling). See docs and _shared/vtu-state.ts.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. transaction_events — append-only
-- ─────────────────────────────────────────────────────────────────────────
-- "What happened to my money" has to be answerable months later. Statuses are
-- overwritten; this is not.

CREATE TABLE IF NOT EXISTS public.transaction_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  reason         TEXT,
  actor          TEXT NOT NULL DEFAULT 'system',
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transaction_events_tx_idx
  ON public.transaction_events (transaction_id, occurred_at);

CREATE OR REPLACE FUNCTION public.reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'public.% is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS transaction_events_append_only ON public.transaction_events;
CREATE TRIGGER transaction_events_append_only
  BEFORE UPDATE OR DELETE ON public.transaction_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. refund_queue
-- ─────────────────────────────────────────────────────────────────────────
-- A failed reversal used to be a console.error and nothing else. The money
-- simply stayed gone.

CREATE TABLE IF NOT EXISTS public.refund_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  reference       TEXT NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason          TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open refund per transaction; resolved rows are unconstrained so history
-- accumulates.
CREATE UNIQUE INDEX IF NOT EXISTS refund_queue_one_open_per_tx
  ON public.refund_queue (transaction_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS refund_queue_due_idx
  ON public.refund_queue (next_attempt_at)
  WHERE resolved_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. mono_mandates
-- ─────────────────────────────────────────────────────────────────────────
-- A standing authorisation to debit, so a customer authorises once at link
-- time rather than logging into their bank for every 100 naira of airtime.

CREATE TABLE IF NOT EXISTS public.mono_mandates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_account_id UUID REFERENCES public.linked_accounts(id) ON DELETE CASCADE,
  mono_mandate_id   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'expired')),
  -- Mandate ceilings, as the bank approved them. A debit above these is
  -- refused before it is attempted.
  max_per_debit     NUMERIC(12, 2),
  max_total         NUMERIC(12, 2),
  debited_total     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  authorised_at     TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mono_mandates_mandate_id_key
  ON public.mono_mandates (mono_mandate_id);

CREATE UNIQUE INDEX IF NOT EXISTS mono_mandates_one_active_per_account
  ON public.mono_mandates (linked_account_id)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. webhook_events — idempotency for the endpoint that authorises spending
-- ─────────────────────────────────────────────────────────────────────────
-- Once payment confirmation arrives by webhook, that endpoint IS the money.
-- A replayed event must do nothing at all.
--
-- The raw payload is deliberately NOT stored: it carries the customer's
-- account details. A hash is enough to prove two deliveries were identical.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  event_type      TEXT,
  reference       TEXT,
  signature_valid BOOLEAN NOT NULL,
  payload_sha256  TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  result          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_key
  ON public.webhook_events (provider, event_id);

CREATE INDEX IF NOT EXISTS webhook_events_recent_idx
  ON public.webhook_events (received_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. provider_catalogue_cache
-- ─────────────────────────────────────────────────────────────────────────
-- Today a slow VTPass means a hard 503 and the customer cannot even browse.
-- This is for BROWSING ONLY: the price charged is always re-resolved live at
-- purchase, and if it moved the customer re-confirms.

CREATE TABLE IF NOT EXISTS public.provider_catalogue_cache (
  id         TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  service_id TEXT NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.provider_catalogue_cache IS
  'Browsing only. Never a source of the price actually charged - that is re-resolved live at purchase.';

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Access
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transaction_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_events        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.refund_queue              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_queue              FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.mono_mandates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mono_mandates             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.provider_catalogue_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_catalogue_cache  FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON public.transaction_events       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.refund_queue             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mono_mandates            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.webhook_events           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.provider_catalogue_cache FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.transaction_events       TO service_role;
GRANT ALL ON public.refund_queue             TO service_role;
GRANT ALL ON public.mono_mandates            TO service_role;
GRANT ALL ON public.webhook_events           TO service_role;
GRANT ALL ON public.provider_catalogue_cache TO service_role;

-- A customer may follow their own transaction's progress. That is the whole
-- point of the live status screen.
GRANT SELECT ON public.transaction_events TO authenticated;

DROP POLICY IF EXISTS "Customers can follow their own transactions" ON public.transaction_events;
CREATE POLICY "Customers can follow their own transactions"
  ON public.transaction_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_events.transaction_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can review transaction events" ON public.transaction_events;
CREATE POLICY "Staff can review transaction events"
  ON public.transaction_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role IN ('admin', 'super_admin', 'support')
        AND COALESCE(sp.status, '') = 'active'
    )
  );

-- The refund queue and the mandate ledger are operator surfaces. Customers see
-- the outcome on their transaction, not the plumbing.
GRANT SELECT ON public.refund_queue TO authenticated;

DROP POLICY IF EXISTS "Admins can review the refund queue" ON public.refund_queue;
CREATE POLICY "Admins can review the refund queue"
  ON public.refund_queue FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role IN ('admin', 'super_admin')
        AND COALESCE(sp.status, '') = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Realtime
-- ─────────────────────────────────────────────────────────────────────────
-- The purchase stops being one blocking request: the app subscribes and
-- watches the state machine. supabase_realtime already carries support chat.

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.linked_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_events;

-- Realtime respects RLS, but only sends the full old record on UPDATE/DELETE
-- when the replica identity is FULL. Without it a status change arrives with
-- no way to tell what it changed from.
ALTER TABLE public.transactions       REPLICA IDENTITY FULL;
ALTER TABLE public.linked_accounts    REPLICA IDENTITY FULL;
