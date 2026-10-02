-- Staff two-factor sign-in and the audit log (portal design handoff).
--
-- 1. platform_settings.staff_mfa_required: when on, a staff member's session
--    must be at AAL2 (password + authenticator code) before the database
--    gives them anything. It starts OFF so the new portals can be deployed
--    first; a super admin turns it on in Settings › Security. Customers (the
--    app) are never affected: the rule only applies to people in
--    staff_profiles.
--
-- 2. audit_events: append-only, hash-chained record of who did what. Rows
--    are written through log_audit_event() (staff, from the portals) or by
--    Edge Functions with the service role. Nothing can update or delete one.

-- ── Settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  staff_mfa_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;

-- True unless the caller is staff, 2FA is required, and this session has
-- not passed it.
CREATE OR REPLACE FUNCTION public.staff_mfa_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT coalesce((SELECT staff_mfa_required FROM public.platform_settings WHERE id = 1), false)
      OR NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.staff_mfa_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mfa_ok() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_staff_mfa()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.staff_mfa_ok() THEN
    RAISE EXCEPTION 'Two-factor sign-in is required.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_staff_mfa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_staff_mfa() TO authenticated, service_role;

-- What the sign-in screen needs to know after the password step.
CREATE OR REPLACE FUNCTION public.staff_sign_in_rules()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'mfaRequired', coalesce((SELECT staff_mfa_required FROM public.platform_settings WHERE id = 1), false)
  );
$$;
REVOKE ALL ON FUNCTION public.staff_sign_in_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_sign_in_rules() TO anon, authenticated;

-- Every table with row security gets one restrictive policy: staff without a
-- passed second factor see and change nothing while the rule is on.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity AND NOT c.relispartition
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_two_factor ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY staff_two_factor ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.staff_mfa_ok())) WITH CHECK ((SELECT public.staff_mfa_ok()))',
      t.relname);
  END LOOP;
END $$;

-- The staff RPCs run as definer and skip row security, so each one checks
-- the second factor itself. Patched in place so their bodies stay as their
-- own migrations wrote them; re-running this is a no-op.
DO $$
DECLARE f record; def text;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
      AND p.proname IN ('admin_resolve_transaction', 'admin_update_merchant_controls', 'delete_customer_user',
                        'delete_merchant_cascade', 'delete_staff_user', 'palm_enrolment_state', 'vtu_operations_snapshot')
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('assert_staff_mfa' IN def) = 0 THEN
      def := regexp_replace(def, '\mBEGIN\M', E'BEGIN\n  PERFORM public.assert_staff_mfa();');
      EXECUTE def;
    END IF;
  END LOOP;
END $$;

-- ── Audit log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  category text NOT NULL CHECK (category IN
    ('Auth', 'Customers', 'Sign-ups', 'Transactions', 'Merchants', 'Terminals', 'Staff', 'Support', 'Settings', 'Alerts')),
  action text NOT NULL,
  target text,
  target_id text,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'denied')),
  reason text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  session_id text,
  prev_hash text,
  hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_occurred_idx ON public.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON public.audit_events (target_id);
CREATE INDEX IF NOT EXISTS audit_events_category_idx ON public.audit_events (category, occurred_at DESC);

-- Each row's hash covers its content and the previous row's hash, so
-- removing or editing any row breaks every hash after it.
CREATE OR REPLACE FUNCTION public.audit_events_chain()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.audit_events'));
  SELECT hash INTO NEW.prev_hash FROM public.audit_events ORDER BY id DESC LIMIT 1;
  NEW.occurred_at := now();
  NEW.hash := encode(sha256(convert_to(concat_ws('|',
    coalesce(NEW.prev_hash, ''), NEW.occurred_at::text, coalesce(NEW.actor_id::text, ''), NEW.actor_name,
    NEW.actor_role, NEW.category, NEW.action, coalesce(NEW.target, ''), coalesce(NEW.target_id, ''), NEW.result,
    coalesce(NEW.reason, ''), coalesce(NEW.before::text, ''), coalesce(NEW.after::text, ''),
    coalesce(NEW.ip, ''), coalesce(NEW.session_id, '')), 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit events cannot be changed or deleted.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_chain ON public.audit_events;
CREATE TRIGGER audit_events_chain BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_chain();
DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();
DROP TRIGGER IF EXISTS audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON public.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_immutable();

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
DROP POLICY IF EXISTS audit_events_admin_read ON public.audit_events;
CREATE POLICY audit_events_admin_read ON public.audit_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff_profiles s WHERE s.id = auth.uid() AND s.role IN ('admin', 'super_admin')));
DROP POLICY IF EXISTS staff_two_factor ON public.audit_events;
CREATE POLICY staff_two_factor ON public.audit_events AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.staff_mfa_ok())) WITH CHECK ((SELECT public.staff_mfa_ok()));

-- Staff record their own actions from the portals. The actor, IP, browser
-- and session come from the request, never from the caller.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_category text,
  p_action text,
  p_target text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_result text DEFAULT 'success'
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff record;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_id bigint;
BEGIN
  SELECT id, full_name, role INTO v_staff FROM public.staff_profiles WHERE id = auth.uid();
  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Only staff can write to the audit log.' USING ERRCODE = '42501';
  END IF;
  -- A failed second factor is itself worth recording, before AAL2.
  IF NOT (p_category = 'Auth' AND p_result = 'denied') THEN
    PERFORM public.assert_staff_mfa();
  END IF;

  INSERT INTO public.audit_events
    (actor_id, actor_name, actor_role, category, action, target, target_id, result, reason, before, after, ip, user_agent, session_id, hash)
  VALUES (
    v_staff.id, coalesce(v_staff.full_name, 'Staff'), v_staff.role, p_category, left(p_action, 200),
    left(p_target, 300), left(p_target_id, 120), p_result, left(nullif(trim(p_reason), ''), 1000), p_before, p_after,
    left(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), 64),
    left(v_headers ->> 'user-agent', 300),
    auth.jwt() ->> 'session_id',
    ''
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, text, text, jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, text, jsonb, jsonb, text, text) TO authenticated;
