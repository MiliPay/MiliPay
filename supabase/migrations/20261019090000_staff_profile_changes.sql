-- Staff can edit their own profile, with approval by role.
--
-- What can change: full name, phone and state. Never the email: it is the
-- sign-in ID and nothing here touches it. Passwords are changed by the
-- person themselves through Supabase Auth and need no approval.
--
-- Who approves:
--   super_admin  their own change applies at once
--   admin        a super admin approves
--   agent        an admin or a super admin approves
--   support      an admin or a super admin approves
-- Nobody decides their own request. The approver is checked against the
-- person's role when the decision is made, not when they asked.
--
-- One open request per person: asking again replaces the open one.
-- Every request, withdrawal and decision goes on the audit log.

CREATE TABLE IF NOT EXISTS public.staff_profile_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  -- Only the fields being changed: any of full_name, phone, state.
  changes jsonb NOT NULL,
  -- Those fields as they were when asked, for the approver to compare.
  previous jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_profile_changes_one_open
  ON public.staff_profile_changes (staff_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS staff_profile_changes_staff_recent
  ON public.staff_profile_changes (staff_id, requested_at DESC);

-- Read and written only through the functions below.
ALTER TABLE public.staff_profile_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_profile_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_profile_changes TO service_role;

-- Who may approve a change for someone with this role.
CREATE OR REPLACE FUNCTION public.staff_profile_approver_roles(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'admin' THEN ARRAY['super_admin']
    WHEN 'agent' THEN ARRAY['admin', 'super_admin']
    WHEN 'support' THEN ARRAY['admin', 'super_admin']
    -- A super admin's own edits apply at once; this only covers a request
    -- left open by someone promoted since they asked.
    WHEN 'super_admin' THEN ARRAY['super_admin']
    ELSE ARRAY[]::text[]
  END;
$$;
REVOKE ALL ON FUNCTION public.staff_profile_approver_roles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_profile_approver_roles(text) TO authenticated, service_role;

-- Writes approved fields. Internal: only the functions below call it.
CREATE OR REPLACE FUNCTION public.apply_staff_profile_changes(p_staff uuid, p_changes jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.staff_profiles SET
    full_name = CASE WHEN p_changes ? 'full_name' THEN p_changes ->> 'full_name' ELSE full_name END,
    phone     = CASE WHEN p_changes ? 'phone' THEN p_changes ->> 'phone' ELSE phone END,
    state     = CASE WHEN p_changes ? 'state' THEN nullif(p_changes ->> 'state', '') ELSE state END
  WHERE id = p_staff;

  -- The portals show the name from the sign-in token, so keep it in step.
  IF p_changes ? 'full_name' THEN
    UPDATE auth.users
       SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('full_name', p_changes ->> 'full_name')
     WHERE id = p_staff;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_staff_profile_changes(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_profile_change_json(c public.staff_profile_changes)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'changes', c.changes,
    'previous', c.previous,
    'requestedAt', c.requested_at,
    'decidedAt', c.decided_at,
    'decidedBy', (SELECT full_name FROM public.staff_profiles WHERE id = c.decided_by),
    'note', c.decision_note
  );
$$;
REVOKE ALL ON FUNCTION public.staff_profile_change_json(public.staff_profile_changes) FROM PUBLIC, anon, authenticated;

-- ── Your own profile ───────────────────────────────────────────────────
-- Your details in full (unmasked: they are yours) and your latest request:
-- the open one, or one decided in the last 14 days so you see the outcome.
CREATE OR REPLACE FUNCTION public.my_staff_profile()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_s public.staff_profiles%ROWTYPE;
  v_c public.staff_profile_changes%ROWTYPE;
BEGIN
  SELECT * INTO v_s FROM public.staff_profiles WHERE id = auth.uid();
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'Staff only.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();

  SELECT * INTO v_c FROM public.staff_profile_changes
   WHERE staff_id = v_s.id
     AND (status = 'pending' OR (status IN ('approved', 'rejected') AND decided_at > now() - interval '14 days'))
   ORDER BY (status = 'pending') DESC, requested_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_s.id,
    'name', v_s.full_name,
    'email', v_s.email,
    'phone', nullif(v_s.phone, ''),
    'state', v_s.state,
    'role', v_s.role,
    'approvers', to_jsonb(public.staff_profile_approver_roles(v_s.role)),
    'request', CASE WHEN v_c.id IS NULL THEN NULL ELSE public.staff_profile_change_json(v_c) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_staff_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_staff_profile() TO authenticated;

-- Ask to change your own details. A super admin's change applies now;
-- anyone else's waits for an approver. Returns the outcome.
CREATE OR REPLACE FUNCTION public.request_staff_profile_change(p_full_name text, p_phone text, p_state text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_s public.staff_profiles%ROWTYPE;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_changes jsonb := '{}'::jsonb;
  v_previous jsonb := '{}'::jsonb;
  v_id uuid;
BEGIN
  SELECT * INTO v_s FROM public.staff_profiles WHERE id = auth.uid() FOR UPDATE;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'Staff only.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();
  IF coalesce(v_s.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'A suspended account cannot change its profile.' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Enter your full name (2 to 80 characters).' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^(\+234|0)[789][01][0-9]{8}$' THEN
    RAISE EXCEPTION 'Enter a valid Nigerian phone number, like 0803 123 4567.' USING ERRCODE = '22023';
  END IF;
  IF v_state IS NOT NULL AND v_state NOT IN (
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
    'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
    'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
    'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
    'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara') THEN
    RAISE EXCEPTION 'Choose a state from the list.' USING ERRCODE = '22023';
  END IF;

  IF v_name IS DISTINCT FROM v_s.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', v_name);
    v_previous := v_previous || jsonb_build_object('full_name', v_s.full_name);
  END IF;
  IF v_phone IS DISTINCT FROM coalesce(v_s.phone, '') THEN
    v_changes := v_changes || jsonb_build_object('phone', v_phone);
    v_previous := v_previous || jsonb_build_object('phone', nullif(v_s.phone, ''));
  END IF;
  IF v_state IS DISTINCT FROM v_s.state THEN
    v_changes := v_changes || jsonb_build_object('state', coalesce(v_state, ''));
    v_previous := v_previous || jsonb_build_object('state', v_s.state);
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing has changed.' USING ERRCODE = '22023';
  END IF;

  IF v_s.role = 'super_admin' THEN
    PERFORM public.apply_staff_profile_changes(v_s.id, v_changes);
    PERFORM public.log_audit_event('Staff', 'updated their own profile', v_name, v_s.id::text,
      v_previous, v_changes, NULL);
    RETURN jsonb_build_object('status', 'applied');
  END IF;

  -- Asking again replaces the open request.
  UPDATE public.staff_profile_changes
     SET status = 'withdrawn', decided_at = now(), decided_by = v_s.id, decision_note = 'Replaced by a newer request.'
   WHERE staff_id = v_s.id AND status = 'pending';

  INSERT INTO public.staff_profile_changes (staff_id, changes, previous)
  VALUES (v_s.id, v_changes, v_previous)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event('Staff', 'asked to change their profile', v_s.full_name, v_s.id::text,
    v_previous, v_changes, NULL);
  RETURN jsonb_build_object('status', 'pending', 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_staff_profile_change(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_staff_profile_change(text, text, text) TO authenticated;

-- Take back your open request.
CREATE OR REPLACE FUNCTION public.withdraw_staff_profile_change()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_c public.staff_profile_changes%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff only.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();

  UPDATE public.staff_profile_changes
     SET status = 'withdrawn', decided_at = now(), decided_by = auth.uid()
   WHERE staff_id = auth.uid() AND status = 'pending'
  RETURNING * INTO v_c;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'You have no change waiting for approval.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit_event('Staff', 'withdrew their profile change',
    (SELECT full_name FROM public.staff_profiles WHERE id = auth.uid()), auth.uid()::text,
    v_c.previous, v_c.changes, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_staff_profile_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_staff_profile_change() TO authenticated;

-- ── Approving ──────────────────────────────────────────────────────────
-- Open requests the caller may decide: a super admin sees admins', agents'
-- and support's; an admin sees agents' and support's. Never their own.
CREATE OR REPLACE FUNCTION public.staff_profile_change_queue()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  PERFORM public.assert_admin();
  SELECT role INTO v_role FROM public.staff_profiles WHERE id = auth.uid();

  RETURN coalesce((
    SELECT jsonb_agg(public.staff_profile_change_json(c) || jsonb_build_object(
             'staffId', s.id, 'name', s.full_name, 'email', s.email, 'role', s.role)
           ORDER BY c.requested_at)
      FROM public.staff_profile_changes c
      JOIN public.staff_profiles s ON s.id = c.staff_id
     WHERE c.status = 'pending'
       AND c.staff_id <> auth.uid()
       AND v_role = ANY (public.staff_profile_approver_roles(s.role))
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_profile_change_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_profile_change_queue() TO authenticated;

-- Approve (apply the change) or reject (a reason is required).
CREATE OR REPLACE FUNCTION public.decide_staff_profile_change(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_c public.staff_profile_changes%ROWTYPE;
  v_s public.staff_profiles%ROWTYPE;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM public.assert_admin();
  SELECT role INTO v_role FROM public.staff_profiles WHERE id = auth.uid();

  SELECT * INTO v_c FROM public.staff_profile_changes WHERE id = p_id FOR UPDATE;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'That request was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_c.status <> 'pending' THEN
    RAISE EXCEPTION 'That request has already been %.', v_c.status USING ERRCODE = '55000';
  END IF;
  IF v_c.staff_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot decide your own request.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.staff_profiles WHERE id = v_c.staff_id;
  IF NOT (v_role = ANY (public.staff_profile_approver_roles(v_s.role))) THEN
    RAISE EXCEPTION 'Only a super admin can decide an administrator''s request.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND v_note IS NULL THEN
    RAISE EXCEPTION 'Give a reason for rejecting it.' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    PERFORM public.apply_staff_profile_changes(v_s.id, v_c.changes);
  END IF;

  UPDATE public.staff_profile_changes
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note
   WHERE id = v_c.id;

  PERFORM public.log_audit_event('Staff',
    CASE WHEN p_approve THEN 'approved a profile change for' ELSE 'rejected a profile change for' END,
    v_s.full_name, v_s.id::text, v_c.previous, v_c.changes, v_note);

  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_staff_profile_change(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_staff_profile_change(uuid, boolean, text) TO authenticated;
