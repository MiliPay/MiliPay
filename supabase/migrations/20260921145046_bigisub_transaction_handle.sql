-- Migration: 20260921145046_bigisub_transaction_handle.sql
-- Description:
--   VTPass is gone; BigiSub is the single fulfilment gateway.
--
--   BigiSub's requery endpoint is keyed on THEIR transaction_id, which is a
--   different value from the human-facing reference that appears on their
--   dashboard. Reconciliation needs both, so both are stored.
--
--   This matters more than a spare column usually would. BigiSub accepts no
--   idempotency key on any purchase endpoint and offers no transaction-list
--   endpoint, so operator_transaction_id is the ONLY handle we ever get for a
--   purchase. Lose it and there is no way to find out what happened —
--   a purchase call can never simply be repeated, because a second call is a
--   second purchase and the customer would be charged once and credited twice.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS operator_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC(12, 2);

COMMENT ON COLUMN public.transactions.operator_transaction_id IS
  'BigiSub transaction_id. The only key their requery endpoint accepts; without it an uncertain purchase cannot be resolved automatically.';

COMMENT ON COLUMN public.transactions.service_charge IS
  'Provider-levied charge (electricity, cable). Separate from fee_amount, which is MiliPay margin.';

CREATE INDEX IF NOT EXISTS transactions_operator_tx_idx
  ON public.transactions (operator_transaction_id)
  WHERE operator_transaction_id IS NOT NULL;
