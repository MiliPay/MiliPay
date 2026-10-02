-- Admin › Customers, customer detail and Sign-ups (portal design handoff).
--
-- - staff_customers / staff_customer_detail: the list and the profile, for
--   admins and support (everyone) and agents (only the people they
--   registered). Only columns a portal may see; never the NIN, BVN or any
--   template.
-- - admin_signups / admin_signup_detail: the Sign-ups page — funnel, bank
--   name mismatches, the tabbed list and the review drawer.
-- - signup_sessions.decision / reminded_at: how a reviewed sign-up ended
--   (approved, another try, rejected, sent to an agent), and when the last
--   reminder SMS went.
-- - revoke_auth_sessions: ends every session of one person (suspension,
--   password reset). Service role only.

ALTER TABLE public.signup_sessions
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('approved', 'retry', 'rejected', 'agent')),
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- Staff with one of these roles, past their second factor; returns the role.
CREATE OR REPLACE FUNCTION public.assert_staff(p_roles text[])
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.staff_profiles WHERE id = auth.uid() AND coalesce(status, 'active') = 'active';
  IF v_role IS NULL OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_staff(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_staff(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_auth_sessions(p_user uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_auth_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_auth_sessions(uuid) TO service_role;

-- ── Customers ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_customers(
  p_tab text DEFAULT 'all',
  p_q text DEFAULT '',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['admin', 'super_admin', 'support', 'agent']);
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_out jsonb;
BEGIN
  IF v_digits LIKE '234%' AND length(v_digits) > 6 THEN
    v_digits := '0' || substr(v_digits, 4);
  END IF;

  WITH base AS (
    SELECT c.*,
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS name,
      CASE
        WHEN c.status = 'pending' THEN 'pending'
        WHEN c.status = 'suspended' THEN 'suspended'
        WHEN c.status = 'rejected' THEN 'rejected'
        ELSE 'active'
      END AS tab
    FROM public.customers c
    WHERE (v_role <> 'agent' OR c.registered_by = auth.uid())
      AND (v_q = ''
           OR (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ILIKE v_like
           OR (length(v_digits) >= 4 AND regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%')
           OR (v_digits ~ '^\d{4}$' AND c.nin_last_4 = v_digits))
  ),
  tabbed AS (
    SELECT * FROM base
    WHERE p_tab = 'all' OR tab = p_tab OR (p_tab = 'tier1' AND tab = 'active' AND kyc_tier = 1)
  )
  SELECT jsonb_build_object(
    'counts', (SELECT jsonb_build_object(
        'all', count(*),
        'pending', count(*) FILTER (WHERE tab = 'pending'),
        'active', count(*) FILTER (WHERE tab = 'active'),
        'tier1', count(*) FILTER (WHERE tab = 'active' AND kyc_tier = 1),
        'suspended', count(*) FILTER (WHERE tab = 'suspended'),
        'rejected', count(*) FILTER (WHERE tab = 'rejected')) FROM base),
    'total', (SELECT count(*) FROM tabbed),
    'rows', coalesce((SELECT jsonb_agg(row_to_json(r)) FROM (
      SELECT t.id, t.name, t.phone, t.nin_last_4 AS "ninLast4", t.state, t.kyc_tier AS tier, t.status,
        t.signup_source AS source, t.has_palm_template AS palm,
        (t.has_face_template OR t.selfie_verified_at IS NOT NULL) AS face,
        (SELECT count(*) FROM public.linked_accounts a WHERE a.user_id = t.auth_user_id AND a.is_active) AS banks,
        s.full_name AS "registeredBy", s.state AS "registeredState", t.created_at AS "createdAt"
      FROM tabbed t LEFT JOIN public.staff_profiles s ON s.id = t.registered_by
      ORDER BY t.created_at DESC
      OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 100)) r), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_customers(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_customers(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_customer_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['admin', 'super_admin', 'support', 'agent']);
  c public.customers%ROWTYPE;
  v_out jsonb;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_id;
  IF c.id IS NULL OR (v_role = 'agent' AND c.registered_by IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'name', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
    'firstName', c.first_name,
    'lastName', c.last_name,
    'phone', c.phone,
    'email', c.email,
    'address', c.address,
    'landmark', c.address_landmark,
    'state', c.state,
    'lga', c.lga,
    'ninLast4', c.nin_last_4,
    'bvnLast4', c.bvn_last_4,
    'ninVerified', c.nin_verified,
    'bvnVerified', c.bvn_verified,
    'dob', c.date_of_birth,
    'gender', c.gender,
    'status', c.status,
    'tier', c.kyc_tier,
    'source', c.signup_source,
    'hasPalm', c.has_palm_template,
    'hasFace', c.has_face_template,
    'palmSimulated', c.palm_simulated,
    'faceSimulated', c.face_simulated,
    'selfieVerifiedAt', c.selfie_verified_at,
    'palmPaused', c.palm_paused,
    'pinThreshold', c.pin_threshold,
    'singleLimit', c.single_limit,
    'dailyLimit', c.daily_limit,
    'rejectionReason', c.rejection_reason,
    'createdAt', c.created_at,
    'verifiedAt', c.verified_at,
    'passwordChangedAt', c.password_changed_at,
    'biometricEnrolledAt', c.biometric_enrolled_at,
    'onboardingCompletedAt', c.onboarding_completed_at,
    'hasLogin', c.auth_user_id IS NOT NULL,
    'tierCaps', (SELECT jsonb_build_object('maxSingle', max_single, 'maxDaily', max_daily) FROM public.tier_caps(coalesce(c.kyc_tier, 2))),
    'registeredBy', (SELECT jsonb_build_object('name', s.full_name, 'state', s.state, 'role', s.role)
                     FROM public.staff_profiles s WHERE s.id = c.registered_by),
    'verifiedBy', (SELECT s.full_name FROM public.staff_profiles s WHERE s.id = c.verified_by),
    'palm', (SELECT jsonb_build_object('captures', count(*), 'quality', round(avg(quality_score)))
             FROM public.palm_templates p WHERE p.customer_id = c.id AND p.retired_at IS NULL),
    'accounts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'bank', a.bank_name, 'last4', right(a.account_number, 4),
                           'palmDefault', a.id = c.palm_account_id) ORDER BY a.created_at)
                          FROM public.linked_accounts a WHERE a.user_id = c.auth_user_id AND a.is_active), '[]'::jsonb),
    'signup', (SELECT jsonb_build_object('id', s.id, 'decision', s.decision, 'phoneVerifiedAt', s.phone_verified_at, 'createdAt', s.created_at,
                 'smileStatus', (SELECT r.status FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)))
               FROM public.signup_sessions s WHERE s.customer_id = c.id ORDER BY s.created_at DESC LIMIT 1),
    'security', jsonb_build_object(
      'passwordResetAt', (SELECT max(used_at) FROM public.password_resets r WHERE r.customer_id = c.id),
      'contactChanges', coalesce((SELECT jsonb_agg(jsonb_build_object('email', x.new_email IS NOT NULL, 'phone', x.new_phone IS NOT NULL, 'at', x.applied_at) ORDER BY x.applied_at DESC)
                                  FROM public.contact_change_requests x WHERE x.customer_id = c.id AND x.applied_at IS NOT NULL), '[]'::jsonb),
      'lastCodeSignIn', (SELECT max(consumed_at) FROM public.login_codes l WHERE l.customer_id = c.id),
      'devices', coalesce((SELECT jsonb_agg(jsonb_build_object('name', d.device_name, 'platform', d.platform, 'lastSeen', d.last_seen_at) ORDER BY d.last_seen_at DESC NULLS LAST)
                           FROM public.push_tokens d WHERE d.customer_id = c.id AND d.revoked_at IS NULL), '[]'::jsonb)
    ),
    'tickets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'ticketId', k.ticket_id, 'subject', coalesce(k.subject, k.issue_description),
                          'status', k.status, 'createdAt', k.created_at) ORDER BY k.created_at DESC)
                         FROM public.support_tickets k WHERE k.customer_id = c.id), '[]'::jsonb),
    'mismatches', coalesce((SELECT jsonb_agg(jsonb_build_object('bank', m.bank_name, 'accountName', m.account_name, 'createdAt', m.created_at) ORDER BY m.created_at DESC)
                            FROM public.bank_name_mismatches m WHERE m.customer_id = c.id), '[]'::jsonb),
    'audit', CASE WHEN v_role IN ('admin', 'super_admin') THEN coalesce((SELECT jsonb_agg(row_to_json(a)) FROM (
                SELECT actor_name AS "actorName", action, reason, occurred_at AS "at"
                FROM public.audit_events WHERE target_id = c.id::text ORDER BY id DESC LIMIT 10) a), '[]'::jsonb)
             ELSE '[]'::jsonb END,
    'txCount', (SELECT count(*) FROM public.transactions t WHERE t.customer_id = c.id),
    'txTotal', (SELECT coalesce(sum(amount), 0) FROM public.transactions t WHERE t.customer_id = c.id AND t.status = 'delivered'),
    'txs', coalesce((SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT id, reference, amount, status, created_at AS "createdAt", (merchant_id IS NOT NULL OR terminal_id IS NOT NULL) AS palm,
          service_type AS "serviceType", provider, merchant_name AS "merchantName"
        FROM public.transactions WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 6) t), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_customer_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_customer_detail(uuid) TO authenticated;

-- ── Sign-ups ────────────────────────────────────────────────────────────
-- Where a sign-up stands, as the page's tabs see it.
CREATE OR REPLACE FUNCTION public.signup_status(s public.signup_sessions)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN s.step = 'review' THEN 'review'
    WHEN s.step = 'done' THEN CASE WHEN s.decision = 'approved' THEN 'approved' ELSE 'completed' END
    WHEN s.decision = 'rejected' THEN 'rejected'
    WHEN s.decision = 'agent' THEN 'agent'
    WHEN s.step = 'abandoned' OR s.expires_at < now() THEN 'abandoned'
    ELSE 'in_progress'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_signups(p_range text DEFAULT 'today', p_tab text DEFAULT 'review', p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  v_start := CASE p_range
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
  END;

  WITH all_s AS (
    SELECT s.*, public.signup_status(s) AS st,
      (SELECT r.status FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)) AS smile_status,
      c.onboarding_completed_at
    FROM public.signup_sessions s LEFT JOIN public.customers c ON c.id = s.customer_id
  ),
  ranged AS (SELECT * FROM all_s WHERE created_at >= v_start),
  listed AS (
    SELECT * FROM all_s
    WHERE (p_tab = st OR (p_tab = 'completed' AND st = 'approved') OR (p_tab = 'rejected' AND st = 'agent'))
      AND (v_q = '' OR coalesce(id_full_name, '') ILIKE v_like
           OR (length(v_digits) >= 4 AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_digits || '%'))
  )
  SELECT jsonb_build_object(
    'funnel', (SELECT jsonb_build_array(
        count(*),
        count(*) FILTER (WHERE phone_verified_at IS NOT NULL),
        count(*) FILTER (WHERE nin IS NOT NULL),
        count(*) FILTER (WHERE id_full_name IS NOT NULL),
        count(*) FILTER (WHERE customer_id IS NOT NULL),
        count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)) FROM ranged),
    'counts', (SELECT jsonb_build_object(
        'review', count(*) FILTER (WHERE st = 'review'),
        'in_progress', count(*) FILTER (WHERE st = 'in_progress'),
        'abandoned', count(*) FILTER (WHERE st = 'abandoned'),
        'completed', count(*) FILTER (WHERE st IN ('completed', 'approved')),
        'rejected', count(*) FILTER (WHERE st IN ('rejected', 'agent'))) FROM all_s),
    'mismatches', coalesce((SELECT jsonb_agg(row_to_json(m)) FROM (
        SELECT x.id, x.customer_id AS "customerId", coalesce(x.customer_name, trim(c.first_name || ' ' || c.last_name)) AS customer,
          x.bank_name AS bank, x.account_name AS "accountName", x.created_at AS "createdAt"
        FROM public.bank_name_mismatches x LEFT JOIN public.customers c ON c.id = x.customer_id
        WHERE x.created_at >= now() - interval '30 days'
        ORDER BY x.created_at DESC LIMIT 6) m), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, phone, id_full_name AS name, step, st AS status, selfie_attempts AS attempts, smile_status AS "smileStatus",
          review_reason AS reason, created_at AS "createdAt", updated_at AS "updatedAt", customer_id AS "customerId"
        FROM listed ORDER BY updated_at DESC LIMIT 200) r), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signups(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signups(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_signup_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.signup_sessions%ROWTYPE;
  v_payload jsonb;
  v_smile_status text;
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO s FROM public.signup_sessions WHERE id = p_id;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT r.payload, r.status INTO v_payload, v_smile_status
  FROM public.smile_results r WHERE r.job_id = coalesce(s.smile_job_id, s.evaluated_job_id);

  SELECT jsonb_build_object(
    'id', s.id,
    'phone', s.phone,
    'name', s.id_full_name,
    'step', s.step,
    'status', public.signup_status(s),
    'decision', s.decision,
    'reason', s.review_reason,
    'attempts', s.selfie_attempts,
    'selfieFailure', s.selfie_failure,
    'ninLast4', right(s.nin, 4),
    'dob', s.date_of_birth,
    'state', s.state,
    'lga', s.lga,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'phoneVerifiedAt', s.phone_verified_at,
    'consentAt', s.consent_at,
    'confirmedAt', s.confirmed_at,
    'reviewedAt', s.reviewed_at,
    'reviewedBy', (SELECT full_name FROM public.staff_profiles WHERE id = s.reviewed_by),
    'remindedAt', s.reminded_at,
    'customerId', s.customer_id,
    'smile', CASE WHEN v_payload IS NULL THEN NULL ELSE jsonb_build_object(
      'jobId', coalesce(s.smile_job_id, s.evaluated_job_id),
      'status', v_smile_status,
      'reason', v_payload ->> 'reason',
      'risk', v_payload #>> '{antifraud,fraud_risk,risk_level}',
      'confidence', CASE WHEN (v_payload ->> 'confidence_value') ~ '^[0-9.]+$' THEN (v_payload ->> 'confidence_value')::numeric END,
      'selfieUrl', v_payload #>> '{image_links,selfie_image}',
      'photoUrl', v_payload #>> '{id_fields,photo_url}',
      'nimcName', v_payload #>> '{id_fields,full_name}',
      'ninMatches', (v_payload #>> '{id_fields,id_number}') = s.nin,
      'dobMatches', (v_payload #>> '{id_fields,date_of_birth}') = s.date_of_birth::text
    ) END
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signup_detail(uuid) TO authenticated;
