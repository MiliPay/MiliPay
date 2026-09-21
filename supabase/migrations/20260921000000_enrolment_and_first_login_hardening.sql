-- Migration: 20260921000000_enrolment_and_first_login_hardening.sql
-- Description:
--   1. Enrolment defaults to 'pending' instead of 'active'.
--   2. Persists the enrolment fields the wizard already collected but dropped
--      (date of birth, gender) and adds facial capture + identity verification.
--   3. Adds an identity_verifications audit trail that records whether a check
--      was SIMULATED or LIVE, so the simulated cohort is identifiable the day a
--      real NIMC/Mono account is wired in.
--   4. Gives customers their own transaction limits, clamped to their tier.
--   5. Tracks first-login state (forced password change, PIN, biometric).
--   6. Removes 'support' from the customers UPDATE policy — approving a KYC
--      record is an administrator action.

-- ─────────────────────────────────────────────────────────────
-- 1. ENROLMENT DEFAULTS TO PENDING
--    The column defaulted to 'active', so any insert path that forgot to set
--    status explicitly created a live account with no approval.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.customers ALTER COLUMN status SET DEFAULT 'pending';

-- ─────────────────────────────────────────────────────────────
-- 2. ENROLMENT FIELDS
--    date_of_birth and gender were collected by the agent wizard and silently
--    discarded because no column existed.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS date_of_birth          DATE,
  ADD COLUMN IF NOT EXISTS gender                 TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS face_template          TEXT,
  ADD COLUMN IF NOT EXISTS face_captured_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_simulated         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS palm_simulated         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nin                    TEXT,
  ADD COLUMN IF NOT EXISTS nin_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nin_verified_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bvn                    TEXT,
  ADD COLUMN IF NOT EXISTS bvn_last_4             TEXT,
  ADD COLUMN IF NOT EXISTS bvn_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bvn_verified_at        TIMESTAMPTZ;

-- Presence flags, so a portal can show "palm on file" without ever being able
-- to read the template itself.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS has_palm_template BOOLEAN
    GENERATED ALWAYS AS (palm_vein_template IS NOT NULL) STORED,
  ADD COLUMN IF NOT EXISTS has_face_template BOOLEAN
    GENERATED ALWAYS AS (face_template IS NOT NULL) STORED;

-- One human, one enrolment. Partial so historical rows with a NULL nin are fine.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_nin_unique
  ON public.customers (nin) WHERE nin IS NOT NULL;

COMMENT ON COLUMN public.customers.nin IS
  'Full NIN. Not encrypted at rest — protected by column privileges and RLS only. '
  'Moving this into Supabase Vault / pgsodium is tracked as follow-up work.';
COMMENT ON COLUMN public.customers.bvn IS
  'Full BVN. Same caveat as customers.nin.';
COMMENT ON COLUMN public.customers.face_template IS
  'Facial feature template from the enrolment device. A SIMULATED- prefix means '
  'no camera was attached; face_simulated records the same fact as a boolean.';

-- ─────────────────────────────────────────────────────────────
-- 3. IDENTITY VERIFICATION AUDIT TRAIL
--    Every NIN/BVN check lands here, tagged with the mode it ran in. When a
--    live NIMC/Mono account arrives, "which customers were only ever simulated"
--    is a one-line query rather than an archaeology exercise.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  id_type       TEXT NOT NULL CHECK (id_type IN ('nin', 'bvn')),
  id_last_4     TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('simulated', 'live')),
  provider      TEXT NOT NULL DEFAULT 'simulation',
  status        TEXT NOT NULL CHECK (status IN ('verified', 'failed', 'unavailable')),
  provider_ref  TEXT,
  matched_name  TEXT,
  failure_reason TEXT,
  requested_by  UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read identity verifications"
  ON public.identity_verifications FOR SELECT
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '')
      IN ('admin', 'super_admin', 'superAdmin', 'agent', 'support')
  );

-- Writes come from the verify-identity Edge Function (service_role) only, so a
-- portal cannot fabricate a "verified" record.
REVOKE INSERT, UPDATE, DELETE ON public.identity_verifications FROM authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_customer
  ON public.identity_verifications (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_mode
  ON public.identity_verifications (mode, status);

-- ─────────────────────────────────────────────────────────────
-- 4. CUSTOMER-SETTABLE TRANSACTION LIMITS
--    NULL means "use the tier default". A customer may only tighten their own
--    limits, never raise them past the tier cap.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS single_limit NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS daily_limit  NUMERIC(12, 2);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS single_limit NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS daily_limit  NUMERIC(12, 2);

-- ─────────────────────────────────────────────────────────────
-- 5. FIRST-LOGIN STATE
--    Authoritative on the customer row, not in user_metadata, because
--    user_metadata is writable by the customer themselves.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS must_change_password        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS password_changed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS biometric_enrolled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_delivery_channel   TEXT,
  ADD COLUMN IF NOT EXISTS password_delivery_status    TEXT,
  ADD COLUMN IF NOT EXISTS password_delivered_at       TIMESTAMPTZ;

-- Existing customers already chose their own password; do not lock them out of
-- their own app behind a change-password wall they have already passed.
UPDATE public.customers
   SET must_change_password = FALSE
 WHERE auth_user_id IS NOT NULL AND status = 'active';

-- Likewise, a customer who already has a PIN has effectively finished setup.
-- Without this they would be walked through the new first-login flow once for
-- no reason.
UPDATE public.customers
   SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
 WHERE auth_user_id IS NOT NULL AND status = 'active' AND pin_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 6. APPROVAL IS AN ADMINISTRATOR ACTION
--    The previous UPDATE policy included 'support', so a support agent could
--    verify a KYC record by writing the table directly.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;

CREATE POLICY "Admins can update customers"
  ON public.customers FOR UPDATE
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '')
      IN ('admin', 'super_admin', 'superAdmin')
  );

-- The only SELECT policy on public.customers was "Staff can view customers", so
-- a signed-in customer could not read their own row. The mobile app queries it
-- for their name, tier and limits and was silently falling back to defaults —
-- including a hardcoded Tier 2 — for every customer.
--
-- Safe to add now that the column grants above decide *which* columns any
-- authenticated session may read: this policy widens the rows, not the columns,
-- so it cannot expose the NIN, BVN or biometric templates.
CREATE POLICY "Customers can view their own record"
  ON public.customers FOR SELECT
  USING (auth_user_id = auth.uid());

-- Status, tier, verification flags and limits are set by Edge Functions running
-- as service_role. A portal session — admin included — may only correct contact
-- details. This makes "approve by direct table write" impossible rather than
-- merely discouraged.
REVOKE UPDATE ON public.customers FROM authenticated, anon;
GRANT  UPDATE (first_name, last_name, phone, email, address, state)
  ON public.customers TO authenticated;

-- Raw NIN/BVN, the palm-vein template, the facial template and the PIN hash are
-- never needed by a client. Withhold them at the column level so no portal
-- query — and no compromised portal session — can read them back out.
REVOKE SELECT ON public.customers FROM authenticated, anon;
GRANT  SELECT (
  id, first_name, last_name, phone, email, address, state,
  nin_last_4, bvn_last_4, date_of_birth, gender,
  status, kyc_tier, pin_threshold, single_limit, daily_limit,
  nin_verified, nin_verified_at, bvn_verified, bvn_verified_at,
  face_captured_at, face_simulated, palm_simulated,
  has_palm_template, has_face_template,
  must_change_password, password_changed_at, biometric_enrolled_at,
  onboarding_completed_at, password_delivery_channel,
  password_delivery_status, password_delivered_at,
  pin_failed_attempts, pin_locked_until,
  auth_user_id, registered_by, verified_by, verified_at,
  rejection_reason, created_at
) ON public.customers TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7. ONBOARDING STATE
--    One round trip that tells the mobile app which first-login steps are still
--    outstanding. Reading it cannot leak another customer's row: it is scoped
--    to auth.uid() inside the function.
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
    SELECT u.kyc_tier,
           u.pin_threshold,
           u.single_limit,
           u.daily_limit,
           (u.pin_hash IS NOT NULL) AS has_pin
      INTO v_row
      FROM public.users u
     WHERE u.id = v_uid
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN json_build_object('found', FALSE);
    END IF;

    RETURN json_build_object(
      'found', TRUE,
      'mustChangePassword', FALSE,
      'hasPin', COALESCE(v_row.has_pin, FALSE),
      'biometricEnrolled', FALSE,
      'onboardingComplete', COALESCE(v_row.has_pin, FALSE),
      'kycTier', COALESCE(v_row.kyc_tier, 2),
      'pinThreshold', COALESCE(v_row.pin_threshold, 10000),
      'singleLimit', v_row.single_limit,
      'dailyLimit', v_row.daily_limit,
      'status', 'active'
    );
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

-- Called after supabase.auth.updateUser({ password }) succeeds. Clearing the
-- flag is only ever to the caller's own detriment if they skip the real change,
-- so this is an onboarding gate, not a security boundary.
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.customers
     SET must_change_password = FALSE,
         password_changed_at  = NOW()
   WHERE auth_user_id = v_uid;

  RETURN json_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_password_changed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;

-- Device biometric enrolment is local to the handset (Keychain / Keystore via
-- expo-local-authentication). This records only that it happened, for support.
CREATE OR REPLACE FUNCTION public.set_biometric_enrolled(p_enrolled BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.customers
     SET biometric_enrolled_at = CASE WHEN p_enrolled THEN NOW() ELSE NULL END
   WHERE auth_user_id = v_uid;

  RETURN json_build_object('success', TRUE, 'enrolled', p_enrolled);
END;
$$;

REVOKE ALL ON FUNCTION public.set_biometric_enrolled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_biometric_enrolled(BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.customers
     SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
   WHERE auth_user_id = v_uid
     AND must_change_password = FALSE
     AND pin_hash IS NOT NULL;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Change your password and set a PIN before finishing setup.'
    );
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. CUSTOMER TRANSACTION LIMITS
--    A customer may tighten their own limits; the tier cap is the ceiling.
--    Kept in one RPC so the two identity tables can never disagree.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tier_caps(p_tier INT)
RETURNS TABLE (max_single NUMERIC, max_daily NUMERIC)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE p_tier WHEN 1 THEN 50000::NUMERIC  WHEN 3 THEN 250000::NUMERIC  ELSE 150000::NUMERIC END,
    CASE p_tier WHEN 1 THEN 200000::NUMERIC WHEN 3 THEN 1000000::NUMERIC ELSE 500000::NUMERIC END;
$$;

GRANT EXECUTE ON FUNCTION public.tier_caps(INT) TO authenticated, service_role;

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
    SELECT kyc_tier, pin_threshold INTO v_tier, v_threshold
      FROM public.users WHERE id = v_uid LIMIT 1;
  END IF;
  v_tier := COALESCE(v_tier, 2);

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

  -- A PIN threshold above the single-transaction limit would leave no amount
  -- that both clears the limit and triggers the PIN, silently disabling it.
  v_threshold := LEAST(COALESCE(v_threshold, 10000), COALESCE(p_single, v_max_single));

  UPDATE public.customers
     SET single_limit  = COALESCE(p_single, single_limit),
         daily_limit   = COALESCE(p_daily,  daily_limit),
         pin_threshold = v_threshold
   WHERE auth_user_id = v_uid;

  UPDATE public.users
     SET single_limit  = COALESCE(p_single, single_limit),
         daily_limit   = COALESCE(p_daily,  daily_limit),
         pin_threshold = v_threshold
   WHERE id = v_uid;

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
-- 9. PIN THRESHOLD — now bounded by the customer's own single limit as well
--    as the tier cap. Replaces the version in 20260920000000.
-- ─────────────────────────────────────────────────────────────
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
    SELECT kyc_tier, single_limit INTO v_tier, v_single
      FROM public.users WHERE id = v_uid LIMIT 1;
  END IF;
  v_tier := COALESCE(v_tier, 2);

  SELECT max_single INTO v_max FROM public.tier_caps(v_tier);
  v_max := LEAST(v_max, COALESCE(v_single, v_max));

  IF p_threshold > v_max THEN
    RAISE EXCEPTION 'Threshold may not exceed your single-transaction limit of %', v_max;
  END IF;

  UPDATE public.customers SET pin_threshold = p_threshold WHERE auth_user_id = v_uid;
  UPDATE public.users     SET pin_threshold = p_threshold WHERE id           = v_uid;

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

-- ─────────────────────────────────────────────────────────────
-- 10. Remove the customer-approval RPC that let the portal approve a KYC
--     record without going through the Edge Function. Approval mints an auth
--     identity and dispatches a credential; it has exactly one code path.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approve_customer_kyc(UUID);

-- ─────────────────────────────────────────────────────────────
-- 11. ENROLMENT GOES THROUGH THE EDGE FUNCTION
--     The insert policy checked that the caller was an agent but not what they
--     were writing, so an agent could post status:'active', kyc_tier:3 and skip
--     approval entirely. enrol-customer now decides those fields server-side.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Agents and Admins can insert customers" ON public.customers;
REVOKE INSERT ON public.customers FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 12. SELF-SERVICE PIN CHECK
--     verify_customer_pin(uuid, text) is service_role only, because it takes a
--     user id and a payment function must be able to check anyone's PIN. The
--     app needs to confirm the customer's own PIN as a fallback when the device
--     fingerprint is unavailable, so this wrapper is scoped to auth.uid() and
--     cannot be pointed at anybody else.
--
--     It shares the same failed-attempt counter and 15-minute lockout, so this
--     is not a way to brute-force around the payment path's rate limiting.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_own_pin(p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN public.verify_customer_pin(v_uid, p_pin);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_own_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_own_pin(TEXT) TO authenticated;
