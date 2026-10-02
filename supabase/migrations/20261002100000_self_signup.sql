-- Self sign-up (design handoff, "Self sign-up (Tier 1)").
--
-- A customer opens a Tier 1 account from the app: phone + SMS code, NIN and
-- date of birth, a Smile ID selfie matched against the NIMC photo, "Is this
-- you?", address, then password / PIN / fingerprint. The signup Edge Function
-- owns every step; these tables are its memory and are service-role only
-- (RLS on, no policies, no grants to anon or authenticated).
--
--   signup_sessions  one row per attempt. The phone code and the resume token
--                    are stored only as HMACs. Progress lives here, so "Save &
--                    exit" and resuming work across reinstalls.
--   smile_results    Smile ID webhook payloads, by job id. The webhook can
--                    arrive before the app reports its job id, so results are
--                    kept on their own and matched to a session afterwards.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS signup_source text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS lga text,
  ADD COLUMN IF NOT EXISTS address_landmark text,
  ADD COLUMN IF NOT EXISTS selfie_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_signup_source_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_signup_source_check CHECK (signup_source IN ('agent', 'self'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.signup_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             text NOT NULL,
  step              text NOT NULL DEFAULT 'phone',
  -- the phone code
  code_hash         text,
  code_sent_at      timestamptz,
  code_expires_at   timestamptz,
  code_attempts     integer NOT NULL DEFAULT 0,
  code_resends      integer NOT NULL DEFAULT 0,
  phone_verified_at timestamptz,
  -- handed to the app once the phone is verified; every later step needs it
  token_hash        text,
  -- identity
  nin               text,
  date_of_birth     date,
  consent_at        timestamptz,
  smile_job_id      text,
  evaluated_job_id  text,
  selfie_attempts   integer NOT NULL DEFAULT 0,
  selfie_failure    text,
  id_first_name     text,
  id_last_name      text,
  id_other_names    text,
  id_full_name      text,
  id_gender         text,
  id_dob            date,
  id_photo_url      text,
  confirmed_at      timestamptz,
  -- address
  state             text,
  lga               text,
  street            text,
  landmark          text,
  -- outcome
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  review_reason     text,
  reviewed_at       timestamptz,
  reviewed_by       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  CONSTRAINT signup_sessions_step_check
    CHECK (step IN ('phone', 'nin', 'selfie', 'confirm', 'addr', 'done', 'review', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS signup_sessions_phone_idx ON public.signup_sessions (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS signup_sessions_review_idx ON public.signup_sessions (created_at DESC) WHERE step = 'review';
CREATE INDEX IF NOT EXISTS signup_sessions_job_idx ON public.signup_sessions (smile_job_id) WHERE smile_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.smile_results (
  job_id      text PRIMARY KEY,
  user_id     text,
  product     text,
  status      text,
  reason      text,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smile_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_sessions FROM anon, authenticated;
REVOKE ALL ON public.smile_results FROM anon, authenticated;
GRANT ALL ON public.signup_sessions TO service_role;
GRANT ALL ON public.smile_results TO service_role;

COMMENT ON TABLE public.signup_sessions IS
  'Self sign-up attempts (signup Edge Function). Service role only; code and resume token stored as HMAC.';
COMMENT ON TABLE public.smile_results IS
  'Smile ID webhook payloads by job id (smile-webhook Edge Function). Service role only.';

-- The app needs to know a customer signed up themselves: setup is then
-- "Step 5 of 5" of sign-up, and "You're all set" shows the Tier 1 card.
CREATE OR REPLACE FUNCTION public.get_onboarding_state()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         c.status,
         c.signup_source
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
    'status', v_row.status,
    'signupSource', COALESCE(v_row.signup_source, 'agent')
  );
END;
$function$;
