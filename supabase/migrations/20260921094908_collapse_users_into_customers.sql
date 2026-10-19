-- Migration: 20260921120000_collapse_users_into_customers.sql
-- Description:
--   public.users and public.customers modelled the same human. Every RPC that
--   touched a customer had to look in one, fall back to the other, and write
--   to both — and getting that dance wrong was already a source of bugs:
--   set_pin_threshold once half-applied because RLS blocked the customers
--   write while the users write succeeded, leaving the two tables disagreeing
--   about the threshold that gates a payment.
--
--   public.users holds 0 rows, nothing foreign-keys to it, and the only code
--   that wrote to it was best-effort "dual-sync" wrapped in an ignored catch.
--   So this is a dead branch, not a data migration: every function drops its
--   users half and the table goes.
--
--   Self-service signup, if it is ever built, belongs in public.customers with
--   a null registered_by, not in a second identity table.
--
--   Also fixes a real bug found while reading delete_customer_user: it deleted
--   `from auth.users where id = target_customer_id`, but that argument is
--   customers.id, which is a different UUID from customers.auth_user_id. The
--   auth identity therefore survived every customer deletion — a "deleted"
--   customer kept a working login, and their phone and email stayed taken.

-- ─────────────────────────────────────────────────────────────
-- 1. PIN functions
-- ─────────────────────────────────────────────────────────────
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

  IF p_pin IN ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','0123') THEN
    RAISE EXCEPTION 'PIN is too easy to guess. Choose a less predictable 4-digit PIN.';
  END IF;

  v_hash := extensions.crypt(p_pin, extensions.gen_salt('bf'));

  UPDATE public.customers
     SET pin_hash = v_hash, pin_failed_attempts = 0, pin_locked_until = NULL
   WHERE auth_user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No customer record for this login';
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_pin(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_has_pin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers
     WHERE auth_user_id = auth.uid() AND pin_hash IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.customer_has_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_pin() TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_customer_pin(p_user_id UUID, p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash         TEXT;
  v_attempts     INT;
  v_locked_until TIMESTAMPTZ;
  v_ok           BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('valid', FALSE, 'code', 'NO_USER');
  END IF;

  -- Accepts either the auth id or the customer id: process-payment passes the
  -- auth id from the palm match, the app passes its own.
  SELECT pin_hash, pin_failed_attempts, pin_locked_until
    INTO v_hash, v_attempts, v_locked_until
    FROM public.customers
   WHERE auth_user_id = p_user_id OR id = p_user_id
   LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN json_build_object('valid', FALSE, 'code', 'PIN_NOT_SET');
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN json_build_object('valid', FALSE, 'code', 'PIN_LOCKED', 'lockedUntil', v_locked_until);
  END IF;

  v_ok := (extensions.crypt(COALESCE(p_pin, ''), v_hash) = v_hash);

  IF v_ok THEN
    UPDATE public.customers
       SET pin_failed_attempts = 0, pin_locked_until = NULL
     WHERE auth_user_id = p_user_id OR id = p_user_id;
    RETURN json_build_object('valid', TRUE);
  END IF;

  v_attempts := COALESCE(v_attempts, 0) + 1;

  UPDATE public.customers
     SET pin_failed_attempts = v_attempts,
         pin_locked_until    = CASE WHEN v_attempts >= 5
                                    THEN NOW() + INTERVAL '15 minutes'
                                    ELSE pin_locked_until END
   WHERE auth_user_id = p_user_id OR id = p_user_id;

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
-- 2. Limits and onboarding
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_onboarding_state()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.must_change_password,
         c.biometric_enrolled_at,
         c.onboarding_completed_at,
         c.kyc_tier,
         c.pin_threshold,
         c.single_limit,
         c.daily_limit,
         (c.pin_hash IS NOT NULL) AS has_pin,
         c.status
    INTO v_row
    FROM public.customers c
   WHERE c.auth_user_id = v_uid
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', FALSE);
  END IF;

  RETURN json_build_object(
    'found', TRUE,
    'mustChangePassword', COALESCE(v_row.must_change_password, FALSE),
    'hasPin', COALESCE(v_row.has_pin, FALSE),
    'biometricEnrolled', (v_row.biometric_enrolled_at IS NOT NULL),
    'onboardingComplete', (v_row.onboarding_completed_at IS NOT NULL),
    'kycTier', COALESCE(v_row.kyc_tier, 2),
    'pinThreshold', COALESCE(v_row.pin_threshold, 10000),
    'singleLimit', v_row.single_limit,
    'dailyLimit', v_row.daily_limit,
    'status', v_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_pin_threshold(p_threshold NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tier   INT;
  v_single NUMERIC;
  v_max    NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be zero or greater';
  END IF;

  SELECT kyc_tier, single_limit INTO v_tier, v_single
    FROM public.customers WHERE auth_user_id = v_uid LIMIT 1;

  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'No customer record for this login';
  END IF;

  SELECT max_single INTO v_max FROM public.tier_caps(v_tier);
  v_max := LEAST(v_max, COALESCE(v_single, v_max));

  IF p_threshold > v_max THEN
    RAISE EXCEPTION 'Threshold may not exceed your single-transaction limit of %', v_max;
  END IF;

  UPDATE public.customers SET pin_threshold = p_threshold WHERE auth_user_id = v_uid;

  RETURN json_build_object(
    'success', TRUE,
    'pinThreshold', p_threshold,
    'kycTier', v_tier,
    'maxThreshold', v_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_pin_threshold(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pin_threshold(NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_transaction_limits(
  p_single NUMERIC DEFAULT NULL,
  p_daily  NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_tier       INT;
  v_max_single NUMERIC;
  v_max_daily  NUMERIC;
  v_threshold  NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT kyc_tier, pin_threshold INTO v_tier, v_threshold
    FROM public.customers WHERE auth_user_id = v_uid LIMIT 1;

  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'No customer record for this login';
  END IF;

  SELECT max_single, max_daily INTO v_max_single, v_max_daily FROM public.tier_caps(v_tier);

  IF p_single IS NOT NULL THEN
    IF p_single <= 0 THEN
      RAISE EXCEPTION 'Single-transaction limit must be greater than zero';
    END IF;
    IF p_single > v_max_single THEN
      RAISE EXCEPTION 'Single-transaction limit may not exceed your Tier % cap of %', v_tier, v_max_single;
    END IF;
  END IF;

  IF p_daily IS NOT NULL THEN
    IF p_daily <= 0 THEN
      RAISE EXCEPTION 'Daily limit must be greater than zero';
    END IF;
    IF p_daily > v_max_daily THEN
      RAISE EXCEPTION 'Daily limit may not exceed your Tier % cap of %', v_tier, v_max_daily;
    END IF;
  END IF;

  IF p_single IS NOT NULL AND p_daily IS NOT NULL AND p_single > p_daily THEN
    RAISE EXCEPTION 'Single-transaction limit cannot exceed your daily limit';
  END IF;

  v_threshold := LEAST(COALESCE(v_threshold, 10000), COALESCE(p_single, v_max_single));

  UPDATE public.customers
     SET single_limit  = COALESCE(p_single, single_limit),
         daily_limit   = COALESCE(p_daily,  daily_limit),
         pin_threshold = v_threshold
   WHERE auth_user_id = v_uid;

  RETURN json_build_object(
    'success', TRUE,
    'kycTier', v_tier,
    'singleLimit', COALESCE(p_single, v_max_single),
    'dailyLimit',  COALESCE(p_daily,  v_max_daily),
    'maxSingle', v_max_single,
    'maxDaily',  v_max_daily,
    'pinThreshold', v_threshold
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_transaction_limits(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_limits(NUMERIC, NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. delete_customer_user: drop the users delete, and fix the auth delete
--    that has never worked.
--
--    NOTE: this still deletes the customer's transactions outright. For a
--    payments operator that is a records-retention question, not an
--    engineering one, so the behaviour is left as found rather than changed
--    unasked — but it is very likely wrong and worth a decision.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_customer_user(target_customer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role  TEXT;
  v_auth_id    UUID;
BEGIN
  caller_role := COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  IF caller_role NOT IN ('admin', 'super_admin', 'superAdmin') THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can delete customers';
  END IF;

  -- customers.id and customers.auth_user_id are different UUIDs. The previous
  -- version deleted auth.users by the customer id, which matched nothing, so
  -- the login survived every deletion.
  SELECT auth_user_id INTO v_auth_id
    FROM public.customers WHERE id = target_customer_id;

  DELETE FROM public.transactions    WHERE customer_id = target_customer_id;
  DELETE FROM public.linked_accounts WHERE customer_id = target_customer_id;
  DELETE FROM public.customers       WHERE id = target_customer_id;

  IF v_auth_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_id;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'deleted_id', target_customer_id,
    'deleted_auth_id', v_auth_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_customer_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_user(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. The table itself. 0 rows, no foreign keys pointing at it.
-- ─────────────────────────────────────────────────────────────
-- On a fresh database the initial schema's linked_accounts.user_id still
-- references public.users; the live one never did (user_id holds the auth
-- id). Drop that key so the table can go. (Added 2026-10-19.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'linked_accounts_user_id_fkey'
               AND confrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.linked_accounts DROP CONSTRAINT linked_accounts_user_id_fkey;
  END IF;
END $$;

DROP TABLE IF EXISTS public.users;
