-- Admin console, "Website": what the marketing website collects, and the
-- public "Find an agent" list (20261014100000_website_leads).
--
-- 1. Leads: merchant terminal applications and agent applications, with a
--    status staff move by hand (new → contacted → approved / trained, or
--    declined). Every change needs a note, kept on the row and on the audit
--    log (Merchants for merchant leads, Staff for agent applications).
-- 2. The waitlist: a count, a page of numbers, and an export that is itself
--    audited (Customers) because it hands out phone numbers.
-- 3. Agent locations: create, edit, unlist / relist and reorder, by state.
--    Only active rows are served by GET /functions/v1/website/agents.
--    Audited under Staff.
--
-- Every function here checks the caller is an admin past their second factor
-- (assert_admin) before anything else. The tables stay closed to browsers.

-- ── States ─────────────────────────────────────────────────────────────
-- The same list as ALL_STATES in supabase/functions/_shared/website.ts: the
-- website's state picker, and what /agents?state= accepts.
CREATE OR REPLACE FUNCTION public.website_state_ok(p_state text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT p_state = ANY (ARRAY[
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
    'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
    'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
    'Taraba', 'Yobe', 'Zamfara'
  ]::text[]);
$$;
REVOKE ALL ON FUNCTION public.website_state_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.website_state_ok(text) TO authenticated, service_role;

ALTER TABLE public.agent_locations DROP CONSTRAINT IF EXISTS agent_locations_state_check;
ALTER TABLE public.agent_locations ADD CONSTRAINT agent_locations_state_check CHECK (public.website_state_ok(state));
ALTER TABLE public.agent_locations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── Lead follow-up ─────────────────────────────────────────────────────
ALTER TABLE public.merchant_leads
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.agent_applications
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS merchant_leads_changed_by_idx ON public.merchant_leads (status_changed_by);
CREATE INDEX IF NOT EXISTS agent_applications_changed_by_idx ON public.agent_applications (status_changed_by);
CREATE INDEX IF NOT EXISTS agent_locations_staff_idx ON public.agent_locations (staff_id);

-- ── Summary (sidebar badge, page headers) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_website_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN jsonb_build_object(
    'newMerchantLeads', (SELECT count(*) FROM public.merchant_leads WHERE status = 'new'),
    'newAgentApplications', (SELECT count(*) FROM public.agent_applications WHERE status = 'new'),
    'waitlist', (SELECT count(*) FROM public.website_waitlist),
    'activeLocations', (SELECT count(*) FROM public.agent_locations WHERE active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_website_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_website_summary() TO authenticated;

-- ── Merchant leads ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_merchant_leads(p_status text DEFAULT 'all', p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
BEGIN
  PERFORM public.assert_admin();
  RETURN (
    WITH l AS (
      SELECT ml.id, ml.business_name AS "businessName", ml.cac_number AS cac, ml.business_type AS "businessType",
             ml.contact_name AS "contactName", ml.phone, ml.email, ml.state, ml.tills,
             ml.settlement_bank AS "settlementBank", ml.status, ml.created_at AS "createdAt",
             ml.status_note AS "statusNote", ml.status_changed_at AS "statusChangedAt",
             s.full_name AS "statusChangedBy"
      FROM public.merchant_leads ml
      LEFT JOIN public.staff_profiles s ON s.id = ml.status_changed_by
      WHERE v_q IS NULL
         OR ml.business_name ILIKE '%' || v_q || '%'
         OR ml.contact_name ILIKE '%' || v_q || '%'
         OR ml.cac_number ILIKE '%' || v_q || '%'
         OR ml.email ILIKE '%' || v_q || '%'
         OR (v_digits <> '' AND ml.phone LIKE '%' || v_digits || '%')
    )
    SELECT jsonb_build_object(
      'counts', jsonb_build_object(
        'all', (SELECT count(*) FROM l),
        'new', (SELECT count(*) FROM l WHERE status = 'new'),
        'contacted', (SELECT count(*) FROM l WHERE status = 'contacted'),
        'approved', (SELECT count(*) FROM l WHERE status = 'approved'),
        'declined', (SELECT count(*) FROM l WHERE status = 'declined')
      ),
      'rows', coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x."createdAt" DESC) FROM (
          SELECT * FROM l WHERE coalesce(p_status, 'all') = 'all' OR l.status = p_status
          ORDER BY l."createdAt" DESC LIMIT 500
        ) x
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_merchant_leads(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_merchant_leads(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_merchant_lead_status(p_id uuid, p_status text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l public.merchant_leads%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Add a note. It goes on the application and the audit log.' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('new', 'contacted', 'approved', 'declined') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_l FROM public.merchant_leads WHERE id = p_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'That application was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_l.status = p_status THEN
    RAISE EXCEPTION 'The application is already %.', p_status USING ERRCODE = '55000';
  END IF;

  UPDATE public.merchant_leads
     SET status = p_status, status_note = left(trim(p_note), 1000), status_changed_at = now(), status_changed_by = auth.uid()
   WHERE id = p_id;
  PERFORM public.log_audit_event('Merchants', 'marked terminal application ' || p_status, v_l.business_name, p_id::text,
    jsonb_build_object('status', v_l.status), jsonb_build_object('status', p_status), p_note);
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_merchant_lead_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_merchant_lead_status(uuid, text, text) TO authenticated;

-- ── Agent applications ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_agent_applications(p_status text DEFAULT 'all', p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
BEGIN
  PERFORM public.assert_admin();
  RETURN (
    WITH a AS (
      SELECT ap.id, ap.full_name AS "fullName", ap.phone, ap.email, ap.state, ap.area, ap.workplace,
             ap.status, ap.created_at AS "createdAt",
             ap.status_note AS "statusNote", ap.status_changed_at AS "statusChangedAt",
             s.full_name AS "statusChangedBy"
      FROM public.agent_applications ap
      LEFT JOIN public.staff_profiles s ON s.id = ap.status_changed_by
      WHERE v_q IS NULL
         OR ap.full_name ILIKE '%' || v_q || '%'
         OR ap.area ILIKE '%' || v_q || '%'
         OR ap.email ILIKE '%' || v_q || '%'
         OR (v_digits <> '' AND ap.phone LIKE '%' || v_digits || '%')
    )
    SELECT jsonb_build_object(
      'counts', jsonb_build_object(
        'all', (SELECT count(*) FROM a),
        'new', (SELECT count(*) FROM a WHERE status = 'new'),
        'contacted', (SELECT count(*) FROM a WHERE status = 'contacted'),
        'trained', (SELECT count(*) FROM a WHERE status = 'trained'),
        'declined', (SELECT count(*) FROM a WHERE status = 'declined')
      ),
      'rows', coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x."createdAt" DESC) FROM (
          SELECT * FROM a WHERE coalesce(p_status, 'all') = 'all' OR a.status = p_status
          ORDER BY a."createdAt" DESC LIMIT 500
        ) x
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_agent_applications(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agent_applications(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_agent_application_status(p_id uuid, p_status text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_a public.agent_applications%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Add a note. It goes on the application and the audit log.' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('new', 'contacted', 'trained', 'declined') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_a FROM public.agent_applications WHERE id = p_id FOR UPDATE;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'That application was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_a.status = p_status THEN
    RAISE EXCEPTION 'The application is already %.', p_status USING ERRCODE = '55000';
  END IF;

  UPDATE public.agent_applications
     SET status = p_status, status_note = left(trim(p_note), 1000), status_changed_at = now(), status_changed_by = auth.uid()
   WHERE id = p_id;
  PERFORM public.log_audit_event('Staff', 'marked agent application ' || p_status, v_a.full_name, p_id::text,
    jsonb_build_object('status', v_a.status), jsonb_build_object('status', p_status), p_note);
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_agent_application_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_agent_application_status(uuid, text, text) TO authenticated;

-- ── Waitlist ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_waitlist(p_q text DEFAULT '', p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  PERFORM public.assert_admin();
  -- "+234 803…" and "0803…" find the same number.
  IF v_digits LIKE '234%' AND length(v_digits) > 3 THEN v_digits := '0' || substr(v_digits, 4); END IF;
  RETURN (
    WITH w AS (
      SELECT id, phone, page, created_at AS "createdAt", notified_at AS "notifiedAt"
      FROM public.website_waitlist
      WHERE v_digits = '' OR phone LIKE '%' || v_digits || '%'
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM public.website_waitlist),
      'today', (SELECT count(*) FROM public.website_waitlist WHERE created_at >= public.lagos_today()),
      'notified', (SELECT count(*) FROM public.website_waitlist WHERE notified_at IS NOT NULL),
      'matching', (SELECT count(*) FROM w),
      'rows', coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x."createdAt" DESC) FROM (
          SELECT * FROM w ORDER BY "createdAt" DESC LIMIT v_limit OFFSET v_offset
        ) x
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_waitlist(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_waitlist(text, integer, integer) TO authenticated;

-- The whole list, for a CSV. Phone numbers leaving the console is recorded.
CREATE OR REPLACE FUNCTION public.admin_export_waitlist()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_n integer;
BEGIN
  PERFORM public.assert_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'phone', phone, 'page', page, 'createdAt', created_at, 'notifiedAt', notified_at
         ) ORDER BY created_at), '[]'::jsonb), count(*)
    INTO v_rows, v_n
    FROM public.website_waitlist;
  PERFORM public.log_audit_event('Customers', 'exported app waitlist', v_n || ' numbers', NULL, NULL,
    jsonb_build_object('rows', v_n), NULL);
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_export_waitlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_waitlist() TO authenticated;

-- ── Agent locations ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_agent_locations(p_state text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN jsonb_build_object(
    'states', coalesce((
      SELECT jsonb_object_agg(state, jsonb_build_object('active', active_n, 'inactive', inactive_n)) FROM (
        SELECT state, count(*) FILTER (WHERE active) AS active_n, count(*) FILTER (WHERE NOT active) AS inactive_n
        FROM public.agent_locations GROUP BY state
      ) s
    ), '{}'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name, 'address', l.address, 'state', l.state, 'hours', l.hours,
               'active', l.active, 'position', l.position, 'createdAt', l.created_at, 'updatedAt', l.updated_at
             ) ORDER BY l.state, l.position, l.name)
      FROM public.agent_locations l
      WHERE p_state IS NULL OR l.state = p_state
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_agent_locations(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agent_locations(text) TO authenticated;

-- Create (p_id NULL) or edit. A new location, or one moved to another state,
-- goes to the bottom of that state's list.
CREATE OR REPLACE FUNCTION public.admin_save_agent_location(
  p_id uuid,
  p_name text,
  p_address text,
  p_state text,
  p_hours text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.agent_locations%ROWTYPE;
  v_name text := trim(coalesce(p_name, ''));
  v_address text := trim(coalesce(p_address, ''));
  v_hours text := nullif(trim(coalesce(p_hours, '')), '');
  v_id uuid;
  v_next integer;
BEGIN
  PERFORM public.assert_admin();
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Give the shop a name (up to 120 characters).' USING ERRCODE = '22023';
  END IF;
  IF length(v_address) < 5 OR length(v_address) > 300 THEN
    RAISE EXCEPTION 'Give the full address (up to 300 characters).' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(public.website_state_ok(p_state), false) THEN
    RAISE EXCEPTION 'Choose a state.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_hours, '')) > 120 THEN
    RAISE EXCEPTION 'Opening hours are up to 120 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(position), -1) + 1 INTO v_next FROM public.agent_locations WHERE state = p_state;

  IF p_id IS NULL THEN
    INSERT INTO public.agent_locations (name, address, state, hours, active, position)
    VALUES (v_name, v_address, p_state, v_hours, true, v_next)
    RETURNING id INTO v_id;
    PERFORM public.log_audit_event('Staff', 'published agent location', v_name, v_id::text, NULL,
      jsonb_build_object('name', v_name, 'address', v_address, 'state', p_state, 'hours', v_hours), NULL);
    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;

  SELECT * INTO v_old FROM public.agent_locations WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'That location was not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.agent_locations
     SET name = v_name, address = v_address, state = p_state, hours = v_hours,
         position = CASE WHEN v_old.state = p_state THEN v_old.position ELSE v_next END,
         updated_at = now()
   WHERE id = p_id;
  PERFORM public.log_audit_event('Staff', 'edited agent location', v_name, p_id::text,
    jsonb_build_object('name', v_old.name, 'address', v_old.address, 'state', v_old.state, 'hours', v_old.hours),
    jsonb_build_object('name', v_name, 'address', v_address, 'state', p_state, 'hours', v_hours), NULL);
  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_agent_location(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_agent_location(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_agent_location_active(p_id uuid, p_active boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l public.agent_locations%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_l FROM public.agent_locations WHERE id = p_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'That location was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_l.active = p_active THEN
    RAISE EXCEPTION '%', CASE WHEN p_active THEN 'That location is already listed.' ELSE 'That location is already hidden.' END
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.agent_locations SET active = p_active, updated_at = now() WHERE id = p_id;
  PERFORM public.log_audit_event('Staff',
    CASE WHEN p_active THEN 'relisted agent location' ELSE 'unlisted agent location' END,
    v_l.name, p_id::text,
    jsonb_build_object('active', v_l.active, 'state', v_l.state), jsonb_build_object('active', p_active), p_reason);
  RETURN jsonb_build_object('success', true, 'active', p_active);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_agent_location_active(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_agent_location_active(uuid, boolean, text) TO authenticated;

-- The order the website lists a state's agents in. p_ids is every location
-- in that state, top first; anything else means the list changed meanwhile.
CREATE OR REPLACE FUNCTION public.admin_reorder_agent_locations(p_state text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_have uuid[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  PERFORM public.assert_admin();
  IF NOT coalesce(public.website_state_ok(p_state), false) THEN
    RAISE EXCEPTION 'Choose a state.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.agent_locations WHERE state = p_state FOR UPDATE;
  SELECT coalesce(array_agg(id ORDER BY position, name), '{}'), coalesce(jsonb_agg(name ORDER BY position, name), '[]'::jsonb)
    INTO v_have, v_before
    FROM public.agent_locations WHERE state = p_state;
  IF p_ids IS NULL
     OR cardinality(p_ids) <> cardinality(v_have)
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> cardinality(v_have)
     OR NOT (p_ids <@ v_have) THEN
    RAISE EXCEPTION 'The list changed while you were editing. Reload and try again.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.agent_locations l
     SET position = o.ord - 1, updated_at = now()
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE l.id = o.id;
  SELECT coalesce(jsonb_agg(l.name ORDER BY o.ord), '[]'::jsonb) INTO v_after
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
    JOIN public.agent_locations l ON l.id = o.id;
  PERFORM public.log_audit_event('Staff', 'reordered agent locations', p_state, NULL,
    jsonb_build_object('order', v_before), jsonb_build_object('order', v_after), NULL);
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reorder_agent_locations(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_agent_locations(text, uuid[]) TO authenticated;
