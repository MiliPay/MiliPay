-- Migration: 20260926120000_quick_pay_mandates.sql
-- Description:
--   Quick pay: the setup half of Mono Direct Debit mandates, and the DirectPay
--   bank-picker shortcut. Additive only — every column is new and nullable or
--   defaulted, and no existing row changes meaning.
--
--   mono_mandates
--     reference        MiliPay's reference for the setup. Mono echoes it on
--                      the mandate's events, and it is how mono-webhook finds
--                      a mandate before Mono's own id is known.
--     mono_mandate_id  now nullable, for that same window: the row is written
--                      BEFORE Mono is asked, so the webhook always has
--                      something to find, and the id is filled in after.
--     ready_at         when Mono said events.mandates.ready — the moment
--                      fingerprint-only purchases became possible.
--     failure_reason   why a mandate is rejected/expired/revoked, for staff.
--     updated_at       for the operations board.
--     status 'rejected' the bank refused it, or it was set up on a different
--                      account from the one the customer chose. Distinct from
--                      'revoked' (switched off) so the app can say which.
--
--   customers.mono_customer_id / mono_customer_app_tag
--     The Mono customer a mandate is signed by, created once and reused, and
--     which Mono app it belongs to (see _shared/mono-app-tag.ts). customers
--     carries column-level grants, so neither is readable by `authenticated`.
--
--   linked_accounts.bank_code / mono_app_tag
--     The bank's code, which Mono needs beside the account number, and which
--     Mono app linked the account — DirectPay can skip Mono's bank picker only
--     for an account linked through the app taking the payment. The tag is a
--     truncated SHA-256 over the app key and a fixed label: it identifies the
--     key and cannot be turned back into it.
--
--   transactions.mono_mandate_id
--     Which mandate paid for a purchase (null for DirectPay). What has been
--     taken under a mandate is counted from this, so the allowance check needs
--     no running total that could drift.

ALTER TABLE public.mono_mandates
  ALTER COLUMN mono_mandate_id DROP NOT NULL;

ALTER TABLE public.mono_mandates
  ADD COLUMN IF NOT EXISTS reference      TEXT,
  ADD COLUMN IF NOT EXISTS ready_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS mono_mandates_reference_key
  ON public.mono_mandates (reference);

ALTER TABLE public.mono_mandates
  DROP CONSTRAINT IF EXISTS mono_mandates_status_check;

ALTER TABLE public.mono_mandates
  ADD CONSTRAINT mono_mandates_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'expired', 'rejected'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS mono_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS mono_customer_app_tag TEXT;

ALTER TABLE public.linked_accounts
  ADD COLUMN IF NOT EXISTS bank_code    TEXT,
  ADD COLUMN IF NOT EXISTS mono_app_tag TEXT;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS mono_mandate_id TEXT;

CREATE INDEX IF NOT EXISTS transactions_mono_mandate_id_idx
  ON public.transactions (mono_mandate_id)
  WHERE mono_mandate_id IS NOT NULL;
