-- Staff and Settings (portal design handoff, step 6).
--
-- - tier_limits: the tier ceilings move out of code into a table the
--   Settings page edits, with a reason and an audit entry. tier_caps() now
--   reads it, so every SQL check follows; the Edge Functions ask tier_caps()
--   too. "PIN required over" is where a new customer in that tier starts;
--   each customer can change theirs in the app.
-- - platform_settings gains the switches Settings owns: idle sign-out, the
--   default merchant fee, and the self sign-up rules the sign-up code reads.
-- - admin_settings / admin_save_tier_limits / admin_save_platform_settings.
--   Turning two-factor on is refused from a session that hasn't passed it,
--   so nobody can lock themselves out.
-- - admin_staff / admin_staff_detail: the Staff pages, with real 2FA status,
--   last sign-in and sessions from auth.
-- - staff_profiles: the policy that let any admin rewrite any staff row
--   (including roles) from the browser is replaced by read-only access;
--   changes go through the staff-admin Edge Function. A staff member's NIN
--   is no longer readable from the portals.

-- ── Tier limits ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tier_limits (
  tier smallint PRIMARY KEY CHECK (tier BETWEEN 1 AND 3),
  max_single numeric(12, 2) NOT NULL CHECK (max_single > 0),
  max_daily numeric(12, 2) NOT NULL CHECK (max_daily > 0),
  pin_over numeric(12, 2) NOT NULL CHECK (pin_over >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (max_single <= max_daily),
  CHECK (pin_over <= max_single)
);
INSERT INTO public.tier_limits (tier, max_single, max_daily, pin_over) VALUES
  (1, 50000, 200000, 10000),
  (2, 150000, 500000, 10000),
  (3, 250000, 1000000, 10000)
ON CONFLICT (tier) DO NOTHING;
ALTER TABLE public.tier_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tier_limits TO authenticated;
DROP POLICY IF EXISTS tier_limits_read ON public.tier_limits;
CREATE POLICY tier_limits_read ON public.tier_limits FOR SELECT TO authenticated USING (true);

-- Same signature as before; now read from the table. Unknown tiers fall back
-- to Tier 2, as tier-math.ts does.
CREATE OR REPLACE FUNCTION public.tier_caps(p_tier INT)
RETURNS TABLE (max_single NUMERIC, max_daily NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.max_single, t.max_daily
  FROM public.tier_limits t
  WHERE t.tier = CASE WHEN p_tier IN (1, 2, 3) THEN p_tier ELSE 2 END;
$$;
REVOKE ALL ON FUNCTION public.tier_caps(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tier_caps(INT) TO authenticated, service_role;

-- A new customer starts with their tier's PIN amount.
CREATE OR REPLACE FUNCTION public.customers_default_pin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT pin_over INTO NEW.pin_threshold FROM public.tier_limits
   WHERE tier = CASE WHEN coalesce(NEW.kyc_tier, 1) IN (1, 2, 3) THEN coalesce(NEW.kyc_tier, 1) ELSE 2 END;
  NEW.pin_threshold := coalesce(NEW.pin_threshold, 10000);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS customers_default_pin ON public.customers;
CREATE TRIGGER customers_default_pin BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_default_pin();

-- ── Platform switches ──────────────────────────────────────────────────
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS idle_sign_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS default_merchant_fee numeric(4, 2) NOT NULL DEFAULT 1.50
  CHECK (default_merchant_fee > 0 AND default_merchant_fee <= 5);
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS self_signup_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS selfie_attempts smallint NOT NULL DEFAULT 3
  CHECK (selfie_attempts BETWEEN 1 AND 5);
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS signup_abandon_hours integer NOT NULL DEFAULT 168
  CHECK (signup_abandon_hours BETWEEN 24 AND 720);

CREATE OR REPLACE FUNCTION public.staff_sign_in_rules()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'mfaRequired', coalesce((SELECT staff_mfa_required FROM public.platform_settings WHERE id = 1), false),
    'idleSignOut', coalesce((SELECT idle_sign_out FROM public.platform_settings WHERE id = 1), false)
  );
$$;
REVOKE ALL ON FUNCTION public.staff_sign_in_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_sign_in_rules() TO anon, authenticated;

-- What the Register merchant form starts its fee at.
CREATE OR REPLACE FUNCTION public.default_merchant_fee()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT default_merchant_fee FROM public.platform_settings WHERE id = 1), 1.50);
$$;
REVOKE ALL ON FUNCTION public.default_merchant_fee() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_merchant_fee() TO authenticated;

-- ── Settings page ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p public.platform_settings%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_p FROM public.platform_settings WHERE id = 1;
  RETURN jsonb_build_object(
    'tiers', (SELECT jsonb_agg(jsonb_build_object('tier', tier, 'maxSingle', max_single, 'maxDaily', max_daily, 'pinOver', pin_over,
                                                  'updatedAt', updated_at) ORDER BY tier) FROM public.tier_limits),
    'security', jsonb_build_object('mfaRequired', v_p.staff_mfa_required, 'idleSignOut', v_p.idle_sign_out),
    'signup', jsonb_build_object('enabled', v_p.self_signup_enabled, 'selfieAttempts', v_p.selfie_attempts,
                                 'abandonHours', v_p.signup_abandon_hours),
    'defaultMerchantFee', v_p.default_merchant_fee,
    'sessionAal', coalesce(auth.jwt() ->> 'aal', 'aal1')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_tier_limits(p_tiers jsonb, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_tier int;
  v_single numeric;
  v_daily numeric;
  v_pin numeric;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_old public.tier_limits%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) = 0 THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
    v_tier := (v_row ->> 'tier')::int;
    v_single := round((v_row ->> 'maxSingle')::numeric, 2);
    v_daily := round((v_row ->> 'maxDaily')::numeric, 2);
    v_pin := round((v_row ->> 'pinOver')::numeric, 2);
    IF v_tier NOT IN (1, 2, 3) THEN
      RAISE EXCEPTION 'Unknown tier.' USING ERRCODE = '22023';
    END IF;
    IF v_single IS NULL OR v_daily IS NULL OR v_pin IS NULL OR v_single <= 0 OR v_daily <= 0 OR v_pin < 0 THEN
      RAISE EXCEPTION 'Tier %: every amount must be filled in.', v_tier USING ERRCODE = '22023';
    END IF;
    IF v_single > v_daily THEN
      RAISE EXCEPTION 'Tier %: the per-payment limit can''t be more than the daily limit.', v_tier USING ERRCODE = '22023';
    END IF;
    IF v_pin > v_single THEN
      RAISE EXCEPTION 'Tier %: the PIN amount can''t be more than the per-payment limit.', v_tier USING ERRCODE = '22023';
    END IF;
    -- Five million in a day is far beyond any CBN tier; a typo, not a policy.
    IF v_daily > 5000000 THEN
      RAISE EXCEPTION 'Tier %: daily limit looks too high.', v_tier USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_old FROM public.tier_limits WHERE tier = v_tier FOR UPDATE;
    IF v_old.max_single IS DISTINCT FROM v_single OR v_old.max_daily IS DISTINCT FROM v_daily OR v_old.pin_over IS DISTINCT FROM v_pin THEN
      v_before := v_before || jsonb_build_object('Tier ' || v_tier, jsonb_build_object('maxSingle', v_old.max_single, 'maxDaily', v_old.max_daily, 'pinOver', v_old.pin_over));
      v_after := v_after || jsonb_build_object('Tier ' || v_tier, jsonb_build_object('maxSingle', v_single, 'maxDaily', v_daily, 'pinOver', v_pin));
      UPDATE public.tier_limits
         SET max_single = v_single, max_daily = v_daily, pin_over = v_pin, updated_at = now(), updated_by = auth.uid()
       WHERE tier = v_tier;
    END IF;
  END LOOP;

  IF v_after = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing changed.' USING ERRCODE = '22023';
  END IF;

  -- A customer's own lower limits stay; ones now above the new ceiling are
  -- clamped by effectiveLimits/tier_caps on every payment anyway.
  PERFORM public.log_audit_event('Settings', 'updated limits for',
    (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(v_after) k), 'tier_limits',
    v_before, v_after, p_reason);
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_tier_limits(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_tier_limits(jsonb, text) TO authenticated;

-- One setting group at a time: 'security', 'signup' or 'merchant_fee'.
CREATE OR REPLACE FUNCTION public.admin_save_platform_settings(p_group text, p_values jsonb, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.platform_settings%ROWTYPE;
  v_new public.platform_settings%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_label text;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.platform_settings WHERE id = 1 FOR UPDATE;
  v_new := v_old;

  IF p_group = 'security' THEN
    v_new.staff_mfa_required := coalesce((p_values ->> 'mfaRequired')::boolean, v_old.staff_mfa_required);
    v_new.idle_sign_out := coalesce((p_values ->> 'idleSignOut')::boolean, v_old.idle_sign_out);
    -- Whoever turns two-factor on must already be using it, or they'd be the
    -- first one locked out.
    IF v_new.staff_mfa_required AND NOT v_old.staff_mfa_required AND coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
      RAISE EXCEPTION 'Set up an authenticator and sign in with it before requiring two-factor for everyone.' USING ERRCODE = '42501';
    END IF;
    v_before := jsonb_build_object('mfaRequired', v_old.staff_mfa_required, 'idleSignOut', v_old.idle_sign_out);
    v_after := jsonb_build_object('mfaRequired', v_new.staff_mfa_required, 'idleSignOut', v_new.idle_sign_out);
    v_label := 'Security settings';
  ELSIF p_group = 'signup' THEN
    v_new.self_signup_enabled := coalesce((p_values ->> 'enabled')::boolean, v_old.self_signup_enabled);
    v_new.selfie_attempts := coalesce((p_values ->> 'selfieAttempts')::smallint, v_old.selfie_attempts);
    v_new.signup_abandon_hours := coalesce((p_values ->> 'abandonHours')::int, v_old.signup_abandon_hours);
    IF v_new.selfie_attempts NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Allow between 1 and 5 selfie attempts.' USING ERRCODE = '22023';
    END IF;
    IF v_new.signup_abandon_hours NOT BETWEEN 24 AND 720 THEN
      RAISE EXCEPTION 'Abandon after between 24 and 720 hours.' USING ERRCODE = '22023';
    END IF;
    v_before := jsonb_build_object('enabled', v_old.self_signup_enabled, 'selfieAttempts', v_old.selfie_attempts, 'abandonHours', v_old.signup_abandon_hours);
    v_after := jsonb_build_object('enabled', v_new.self_signup_enabled, 'selfieAttempts', v_new.selfie_attempts, 'abandonHours', v_new.signup_abandon_hours);
    v_label := 'Self sign-up rules';
  ELSIF p_group = 'merchant_fee' THEN
    v_new.default_merchant_fee := round((p_values ->> 'defaultMerchantFee')::numeric, 2);
    IF v_new.default_merchant_fee IS NULL OR v_new.default_merchant_fee <= 0 OR v_new.default_merchant_fee > 5 THEN
      RAISE EXCEPTION 'Fee must be between 0 and 5%%.' USING ERRCODE = '22023';
    END IF;
    v_before := jsonb_build_object('defaultMerchantFee', v_old.default_merchant_fee);
    v_after := jsonb_build_object('defaultMerchantFee', v_new.default_merchant_fee);
    v_label := 'Pricing';
  ELSE
    RAISE EXCEPTION 'Unknown settings group.' USING ERRCODE = '22023';
  END IF;

  IF v_before = v_after THEN
    RAISE EXCEPTION 'Nothing changed.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_settings
     SET staff_mfa_required = v_new.staff_mfa_required,
         idle_sign_out = v_new.idle_sign_out,
         self_signup_enabled = v_new.self_signup_enabled,
         selfie_attempts = v_new.selfie_attempts,
         signup_abandon_hours = v_new.signup_abandon_hours,
         default_merchant_fee = v_new.default_merchant_fee,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = 1;

  PERFORM public.log_audit_event('Settings',
    CASE p_group WHEN 'signup' THEN 'changed self sign-up rules' WHEN 'merchant_fee' THEN 'updated fees and margins' ELSE 'changed security settings' END,
    v_label, 'platform_settings', v_before, v_after, p_reason);
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_platform_settings(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_platform_settings(text, jsonb, text) TO authenticated;

-- ── Staff pages ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_staff()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x."createdAt") FROM (
      SELECT s.id, s.full_name AS name, s.email, s.role, s.state, coalesce(s.status, 'active') AS status,
             s.created_at AS "createdAt",
             u.last_sign_in_at AS "lastSignIn",
             EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = s.id AND f.status = 'verified') AS "twoFactor",
             (SELECT max(a.occurred_at) FROM public.audit_events a WHERE a.actor_id = s.id) AS "lastAction",
             CASE WHEN s.role = 'agent' THEN (SELECT count(*) FROM public.customers c WHERE c.registered_by = s.id) END AS registrations
      FROM public.staff_profiles s LEFT JOIN auth.users u ON u.id = s.id
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_staff_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_s public.staff_profiles%ROWTYPE;
BEGIN
  -- Anyone may read their own (My profile); otherwise admins only.
  IF p_id IS DISTINCT FROM auth.uid() THEN
    PERFORM public.assert_admin();
  ELSE
    PERFORM public.assert_staff_mfa();
  END IF;
  SELECT * INTO v_s FROM public.staff_profiles WHERE id = p_id;
  IF v_s.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_s.id,
    'name', v_s.full_name,
    'email', v_s.email,
    'phone', CASE WHEN length(v_s.phone) >= 8 THEN left(v_s.phone, 4) || ' ••• ' || right(v_s.phone, 4) ELSE v_s.phone END,
    'role', v_s.role,
    'state', v_s.state,
    'status', coalesce(v_s.status, 'active'),
    'ninLast4', v_s.nin_last_4,
    'createdAt', v_s.created_at,
    'self', v_s.id = auth.uid(),
    'lastSignIn', (SELECT last_sign_in_at FROM auth.users WHERE id = v_s.id),
    'twoFactor', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_s.id AND f.status = 'verified'),
    'registrations', CASE WHEN v_s.role = 'agent' THEN (SELECT count(*) FROM public.customers c WHERE c.registered_by = v_s.id) END,
    'sessions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', x.id, 'userAgent', x.user_agent, 'ip', host(x.ip), 'aal', x.aal,
               'lastActive', coalesce(x.refreshed_at, x.updated_at, x.created_at),
               'current', x.id::text = coalesce(auth.jwt() ->> 'session_id', ''))
             ORDER BY coalesce(x.refreshed_at, x.updated_at, x.created_at) DESC)
      FROM (SELECT * FROM auth.sessions WHERE user_id = v_s.id
            ORDER BY coalesce(refreshed_at, updated_at, created_at) DESC LIMIT 10) x
    ), '[]'::jsonb),
    'activity', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'at', a.occurred_at, 'action', a.action, 'target', a.target,
                                          'category', a.category, 'result', a.result) ORDER BY a.occurred_at DESC)
      FROM (SELECT * FROM public.audit_events WHERE actor_id = v_s.id ORDER BY occurred_at DESC LIMIT 12) a
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_staff_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_staff_detail(uuid) TO authenticated;

-- "Sign out other sessions", for yourself.
CREATE OR REPLACE FUNCTION public.revoke_other_sessions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_n integer;
  v_current text := coalesce(auth.jwt() ->> 'session_id', '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff only.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();
  DELETE FROM auth.sessions WHERE user_id = auth.uid() AND id::text <> v_current;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_audit_event('Auth', 'signed out other sessions for',
    (SELECT full_name FROM public.staff_profiles WHERE id = auth.uid()), auth.uid()::text, NULL,
    jsonb_build_object('sessionsEnded', v_n), NULL);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_other_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_other_sessions() TO authenticated;

-- ── staff_profiles: read-only from the portals ─────────────────────────
DROP POLICY IF EXISTS "Admins have full access to staff_profiles" ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_admin_read ON public.staff_profiles;
CREATE POLICY staff_profiles_admin_read ON public.staff_profiles FOR SELECT TO authenticated
  USING (((auth.jwt() -> 'app_metadata') ->> 'role') IN ('super_admin', 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.staff_profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.staff_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, full_name, email, phone, role, state, status, nin_last_4, created_at)
  ON public.staff_profiles TO authenticated;
