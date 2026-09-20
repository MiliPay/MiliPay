-- Migration: 20260920000000_security_hardening_and_currency_invariant.sql
-- Description:
--   1. Normalises linked_accounts.balance to Naira numeric(12,2) (Currency Invariant).
--   2. Revokes client write access to account balances (server-authoritative ledger).
--   3. Adds atomic debit/credit RPCs so balance updates are race-free.
--   4. Adds real PIN set/verify RPCs backed by pgcrypto (previously pin_hash was dead).
--   5. Locks down vtu_settings writes to administrators only.
--   6. Backfills transaction columns the application already writes to.

-- ─────────────────────────────────────────────────────────────
-- 0. One-shot data-fix ledger so destructive backfills never run twice
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_migrations (
  key         TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.data_migrations ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may read/write.

-- ─────────────────────────────────────────────────────────────
-- 1. Columns the application writes but no migration ever declared
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_id   UUID;

ALTER TABLE public.linked_accounts
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- ─────────────────────────────────────────────────────────────
-- 2. CURRENCY INVARIANT: convert linked_accounts.balance kobo -> Naira
--    The column was created outside migrations and held integer kobo.
--    GEMINI.md mandates Naira numeric(12,2) everywhere.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.data_migrations WHERE key = 'linked_accounts_balance_kobo_to_naira') THEN

    -- Widen to numeric first so the division does not truncate.
    ALTER TABLE public.linked_accounts
      ALTER COLUMN balance TYPE NUMERIC(14, 4) USING COALESCE(balance, 0)::NUMERIC;

    UPDATE public.linked_accounts
    SET balance = ROUND(COALESCE(balance, 0)::NUMERIC / 100.0, 2);

    ALTER TABLE public.linked_accounts
      ALTER COLUMN balance TYPE NUMERIC(12, 2) USING ROUND(balance, 2);

    ALTER TABLE public.linked_accounts
      ALTER COLUMN balance SET DEFAULT 0.00,
      ALTER COLUMN balance SET NOT NULL;

    INSERT INTO public.data_migrations (key) VALUES ('linked_accounts_balance_kobo_to_naira');
  END IF;
END $$;

COMMENT ON COLUMN public.linked_accounts.balance IS
  'Available balance in NAIRA, numeric(12,2). NEVER kobo. Writable only by the service role via debit/credit RPCs.';

-- Balance must never be negative.
ALTER TABLE public.linked_accounts DROP CONSTRAINT IF EXISTS linked_accounts_balance_non_negative;
ALTER TABLE public.linked_accounts
  ADD CONSTRAINT linked_accounts_balance_non_negative CHECK (balance >= 0);

-- ─────────────────────────────────────────────────────────────
-- 3. SERVER-AUTHORITATIVE LEDGER
--    Previously "Users can update their own linked accounts" let any
--    signed-in client set its own balance to an arbitrary value.
--    RLS cannot scope columns, so use column-level GRANTs.
-- ─────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.linked_accounts FROM authenticated;
GRANT  UPDATE (is_active) ON public.linked_accounts TO authenticated;

-- Clients may no longer forge ledger entries either; only the service role inserts.
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 4. ATOMIC BALANCE MOVEMENT (race-free; replaces read-modify-write)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debit_linked_account(
  p_account_id UUID,
  p_user_id    UUID,
  p_amount     NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Single statement: the row lock, the funds check and the write are atomic.
  UPDATE public.linked_accounts
  SET balance = balance - p_amount
  WHERE id = p_account_id
    AND user_id = p_user_id
    AND is_active = TRUE
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- Distinguish "not yours / missing" from "not enough money".
    IF NOT EXISTS (
      SELECT 1 FROM public.linked_accounts
      WHERE id = p_account_id AND user_id = p_user_id AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
    END IF;
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_linked_account(
  p_account_id UUID,
  p_amount     NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Reversals must succeed even if the account was deactivated mid-flight.
  UPDATE public.linked_accounts
  SET balance = balance + p_amount
  WHERE id = p_account_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Edge Functions only. Never grant these to authenticated clients.
REVOKE ALL ON FUNCTION public.debit_linked_account(UUID, UUID, NUMERIC)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_linked_account(UUID, NUMERIC)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_linked_account(UUID, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_linked_account(UUID, NUMERIC)      TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. REAL PIN STORAGE & VERIFICATION
--    users.pin_hash existed since the initial schema but nothing ever
--    wrote or read it: the 4-digit PIN was cosmetic end to end.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pin_hash            TEXT,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until    TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until    TIMESTAMPTZ;

-- A customer sets their own PIN; auth.uid() means they cannot set anyone else's.
CREATE OR REPLACE FUNCTION public.set_customer_pin(p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_hash TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  -- Reject the trivially guessable PINs before they reach the ledger.
  IF p_pin IN ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','0123') THEN
    RAISE EXCEPTION 'PIN is too easy to guess. Choose a less predictable 4-digit PIN.';
  END IF;

  v_hash := extensions.crypt(p_pin, extensions.gen_salt('bf'));

  UPDATE public.customers
  SET pin_hash = v_hash, pin_failed_attempts = 0, pin_locked_until = NULL
  WHERE auth_user_id = v_uid;

  UPDATE public.users
  SET pin_hash = v_hash, pin_failed_attempts = 0, pin_locked_until = NULL
  WHERE id = v_uid;

  RETURN json_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_pin(TEXT) TO authenticated;

-- Has this customer set a PIN yet? (no secret material leaves the database)
CREATE OR REPLACE FUNCTION public.customer_has_pin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers WHERE auth_user_id = auth.uid() AND pin_hash IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.users     WHERE id           = auth.uid() AND pin_hash IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.customer_has_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_pin() TO authenticated;

-- Verification is service-role only: a client must never be able to oracle the PIN.
-- Five wrong attempts locks the PIN for 15 minutes (a 4-digit PIN is otherwise
-- exhaustible in seconds).
CREATE OR REPLACE FUNCTION public.verify_customer_pin(p_user_id UUID, p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash            TEXT;
  v_attempts        INT;
  v_locked_until    TIMESTAMPTZ;
  v_source          TEXT;
  v_ok              BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('valid', FALSE, 'code', 'NO_USER');
  END IF;

  SELECT pin_hash, pin_failed_attempts, pin_locked_until, 'customers'
  INTO v_hash, v_attempts, v_locked_until, v_source
  FROM public.customers
  WHERE auth_user_id = p_user_id OR id = p_user_id
  LIMIT 1;

  IF v_hash IS NULL THEN
    SELECT pin_hash, pin_failed_attempts, pin_locked_until, 'users'
    INTO v_hash, v_attempts, v_locked_until, v_source
    FROM public.users
    WHERE id = p_user_id
    LIMIT 1;
  END IF;

  IF v_hash IS NULL THEN
    RETURN json_build_object('valid', FALSE, 'code', 'PIN_NOT_SET');
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN json_build_object('valid', FALSE, 'code', 'PIN_LOCKED', 'lockedUntil', v_locked_until);
  END IF;

  v_ok := (extensions.crypt(COALESCE(p_pin, ''), v_hash) = v_hash);

  IF v_ok THEN
    IF v_source = 'customers' THEN
      UPDATE public.customers SET pin_failed_attempts = 0, pin_locked_until = NULL
      WHERE auth_user_id = p_user_id OR id = p_user_id;
    ELSE
      UPDATE public.users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = p_user_id;
    END IF;
    RETURN json_build_object('valid', TRUE);
  END IF;

  v_attempts := COALESCE(v_attempts, 0) + 1;

  IF v_source = 'customers' THEN
    UPDATE public.customers
    SET pin_failed_attempts = v_attempts,
        pin_locked_until    = CASE WHEN v_attempts >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE pin_locked_until END
    WHERE auth_user_id = p_user_id OR id = p_user_id;
  ELSE
    UPDATE public.users
    SET pin_failed_attempts = v_attempts,
        pin_locked_until    = CASE WHEN v_attempts >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE pin_locked_until END
    WHERE id = p_user_id;
  END IF;

  RETURN json_build_object(
    'valid', FALSE,
    'code', CASE WHEN v_attempts >= 5 THEN 'PIN_LOCKED' ELSE 'PIN_INCORRECT' END,
    'attemptsRemaining', GREATEST(0, 5 - v_attempts)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_customer_pin(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_customer_pin(UUID, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. vtu_settings: pricing config was world-writable via "USING (true)"
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow update access to vtu_settings" ON public.vtu_settings;
DROP POLICY IF EXISTS "Allow insert access to vtu_settings" ON public.vtu_settings;

CREATE POLICY "Admins can update vtu_settings"
  ON public.vtu_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
        AND staff_profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
        AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert vtu_settings"
  ON public.vtu_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
        AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Read stays open: surcharges are public retail pricing the app must render.

-- ─────────────────────────────────────────────────────────────
-- 7. RATE LIMITING (project rules mandate this on every backend integration)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits          INT         NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits(window_start);

-- Fixed-window counter. Returns TRUE when the call is allowed.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            TEXT,
  p_limit          INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits INT;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, window_start, hits)
  VALUES (p_key, NOW(), 1)
  ON CONFLICT (key) DO UPDATE
  SET
    -- Reset the counter when the previous window has elapsed.
    window_start = CASE
      WHEN rl.window_start < NOW() - make_interval(secs => p_window_seconds)
      THEN NOW() ELSE rl.window_start END,
    hits = CASE
      WHEN rl.window_start < NOW() - make_interval(secs => p_window_seconds)
      THEN 1 ELSE rl.hits + 1 END
  RETURNING rl.hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 8. PIN THRESHOLD: one authoritative write path
--    The app wrote public.customers and public.users separately. RLS blocks
--    customers for a customer login, so the write silently half-applied and
--    the edge functions (which read customers first) kept the old threshold.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_pin_threshold(p_threshold NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tier      INT;
  v_max       NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be zero or greater';
  END IF;

  SELECT kyc_tier INTO v_tier FROM public.customers WHERE auth_user_id = v_uid LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT kyc_tier INTO v_tier FROM public.users WHERE id = v_uid LIMIT 1;
  END IF;
  v_tier := COALESCE(v_tier, 2);

  -- A threshold above the tier's single-transaction cap would disable the PIN
  -- challenge entirely, so clamp it to the cap.
  v_max := CASE v_tier WHEN 1 THEN 50000 WHEN 3 THEN 250000 ELSE 150000 END;

  IF p_threshold > v_max THEN
    RAISE EXCEPTION 'Threshold may not exceed your Tier % single-transaction limit of %', v_tier, v_max;
  END IF;

  UPDATE public.customers SET pin_threshold = p_threshold WHERE auth_user_id = v_uid;
  UPDATE public.users     SET pin_threshold = p_threshold WHERE id           = v_uid;

  RETURN json_build_object('success', TRUE, 'pinThreshold', p_threshold, 'kycTier', v_tier);
END;
$$;

REVOKE ALL ON FUNCTION public.set_pin_threshold(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pin_threshold(NUMERIC) TO authenticated;

-- Customers must not be able to raise their own KYC tier or threshold by
-- writing the column directly.
REVOKE UPDATE ON public.users FROM authenticated;
GRANT  UPDATE (email, bvn, nin, is_verified) ON public.users TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. PARTITION HARDENING
--    public.transactions is RANGE partitioned. Privileges on the parent do not
--    propagate to partitions, so a client could bypass the parent's revoked
--    INSERT by writing straight into transactions_YYYY_MM. Close that for
--    existing partitions, and for every partition the trigger creates later.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_partition RECORD;
BEGIN
  FOR v_partition IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c      ON c.oid = i.inhrelid
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_namespace n  ON n.oid = parent.relnamespace
    WHERE parent.relname = 'transactions' AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon',
      v_partition.relname
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_partition_and_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partition_name     TEXT;
  start_of_month     TEXT;
  end_of_next_month  TEXT;
BEGIN
  partition_name    := 'transactions_' || to_char(NEW.created_at, 'YYYY_MM');
  start_of_month    := to_char(date_trunc('month', NEW.created_at), 'YYYY-MM-DD');
  end_of_next_month := to_char(date_trunc('month', NEW.created_at) + interval '1 month', 'YYYY-MM-DD');

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.transactions FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_of_month, end_of_next_month
    );

    -- A new partition must inherit the parent's lockdown, not the schema
    -- default privileges.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon',
      partition_name
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
  END IF;

  RETURN NEW;
END;
$$;
