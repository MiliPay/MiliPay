-- Admin › Agent stock: terminals not yet at a merchant, either in the
-- warehouse (held_by null) or in an agent's bag (held_by = the agent).
-- Admins add new terminals to stock, hand them to agents, move them between
-- agents and take them back; every change is on the audit log. Agents then
-- assign them to merchants from the agent portal (agent_assign_terminal,
-- onboard-merchant terminalMode "stock").

ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS held_since timestamptz;

-- Terminals page: only terminals at a merchant. Stock has never sent a
-- heartbeat and would otherwise all count as offline.
CREATE OR REPLACE FUNCTION public.admin_terminals(p_tab text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today timestamptz := public.lagos_today();
BEGIN
  PERFORM public.assert_admin();
  RETURN (
    WITH t AS (
      SELECT p.id, p.terminal_id AS tid, p.merchant_id AS "merchantId", m.business_name AS merchant,
             p.device_model AS model, p.device_serial_number AS serial, p.is_active AS active,
             p.last_heartbeat AS "lastHeartbeat", public.terminal_state(p.is_active, p.last_heartbeat) AS state,
             (SELECT count(*) FROM public.transactions x
               WHERE x.terminal_id = p.terminal_id AND x.created_at >= v_today AND x.status IN ('delivered', 'success', 'completed')) AS "txnsToday",
             (SELECT coalesce(sum(x.amount), 0) FROM public.transactions x
               WHERE x.terminal_id = p.terminal_id AND x.created_at >= v_today AND x.status IN ('delivered', 'success', 'completed')) AS "volumeToday"
      FROM public.pos_terminals p JOIN public.merchants m ON m.id = p.merchant_id
    )
    SELECT jsonb_build_object(
      'counts', jsonb_build_object(
        'all', (SELECT count(*) FROM t),
        'online', (SELECT count(*) FROM t WHERE state = 'online'),
        'offline', (SELECT count(*) FROM t WHERE state = 'offline'),
        'inactive', (SELECT count(*) FROM t WHERE state = 'inactive')
      ),
      'paymentsToday', (SELECT coalesce(sum("txnsToday"), 0) FROM t),
      'stock', (SELECT count(*) FROM public.pos_terminals WHERE merchant_id IS NULL),
      'rows', coalesce((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.tid) FROM t
        WHERE coalesce(p_tab, 'all') = 'all' OR t.state = p_tab
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_terminals(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_terminals(text) TO authenticated;

-- ── The stock list ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_stock()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x.tid) FROM (
      SELECT p.id, p.terminal_id AS tid, p.device_model AS model, p.device_serial_number AS serial, p.is_active AS active,
             coalesce(p.held_since, p.created_at) AS since,
             CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.full_name, 'state', s.state) END AS "heldBy"
      FROM public.pos_terminals p LEFT JOIN public.staff_profiles s ON s.id = p.held_by
      WHERE p.merchant_id IS NULL) x), '[]'::jsonb),
    'agents', coalesce((SELECT jsonb_agg(row_to_json(a) ORDER BY a.name) FROM (
      SELECT s.id, s.full_name AS name, s.state,
             (SELECT count(*) FROM public.pos_terminals p WHERE p.held_by = s.id AND p.merchant_id IS NULL) AS holding
      FROM public.staff_profiles s
      WHERE s.role = 'agent' AND coalesce(s.status, 'active') = 'active') a), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock() TO authenticated;

/** The agent a terminal may go to: an active agent, or null for the warehouse. */
CREATE OR REPLACE FUNCTION public.stock_agent_name(p_agent uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_agent IS NULL THEN
    RETURN 'Warehouse';
  END IF;
  SELECT full_name INTO v_name FROM public.staff_profiles
   WHERE id = p_agent AND role = 'agent' AND coalesce(status, 'active') = 'active';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Pick an active agent.' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce(v_name, 'Agent');
END;
$$;
REVOKE ALL ON FUNCTION public.stock_agent_name(uuid) FROM PUBLIC, anon, authenticated;

-- ── Add new terminals to stock ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_stock_add(p_tid text, p_serial text, p_model text, p_agent uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tid text := upper(trim(coalesce(p_tid, '')));
  v_serial text := trim(coalesce(p_serial, ''));
  v_to text;
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();
  IF v_tid !~ '^[A-Z0-9][A-Z0-9-]{2,39}$' THEN
    RAISE EXCEPTION 'Enter the terminal ID printed on the device, like TRM-1234.' USING ERRCODE = '22023';
  END IF;
  IF length(v_serial) < 3 THEN
    RAISE EXCEPTION 'Enter the serial number.' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_model, ''))) < 2 THEN
    RAISE EXCEPTION 'Choose the device model.' USING ERRCODE = '22023';
  END IF;
  v_to := public.stock_agent_name(p_agent);
  IF EXISTS (SELECT 1 FROM public.pos_terminals WHERE terminal_id = v_tid) THEN
    RAISE EXCEPTION 'Terminal % is already registered.', v_tid USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_terminals WHERE device_serial_number = v_serial) THEN
    RAISE EXCEPTION 'A terminal with that serial number is already registered.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pos_terminals (terminal_id, merchant_id, device_serial_number, device_model, is_active, held_by, held_since)
  VALUES (v_tid, NULL, v_serial, left(trim(p_model), 80), true, p_agent, CASE WHEN p_agent IS NULL THEN NULL ELSE now() END)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event('Terminals', 'added terminal to stock', v_tid, v_id::text, NULL,
    jsonb_build_object('heldBy', v_to, 'serial', v_serial, 'model', p_model), NULL);
  RETURN jsonb_build_object('success', true, 'id', v_id, 'tid', v_tid, 'heldBy', v_to);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_stock_add(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_add(text, text, text, uuid) TO authenticated;

-- ── Hand a terminal to an agent, move it, or take it back ─────────────────
CREATE OR REPLACE FUNCTION public.admin_stock_move(p_terminal uuid, p_agent uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.pos_terminals%ROWTYPE;
  v_from text;
  v_to text;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.pos_terminals WHERE id = p_terminal FOR UPDATE;
  IF t.id IS NULL OR t.merchant_id IS NOT NULL THEN
    RAISE EXCEPTION 'That terminal isn''t in stock. It may have just been assigned to a merchant.' USING ERRCODE = '55000';
  END IF;
  IF t.held_by IS NOT DISTINCT FROM p_agent THEN
    RAISE EXCEPTION 'It''s already there.' USING ERRCODE = '22023';
  END IF;
  v_to := public.stock_agent_name(p_agent);
  v_from := coalesce((SELECT full_name FROM public.staff_profiles WHERE id = t.held_by), 'Warehouse');

  UPDATE public.pos_terminals
     SET held_by = p_agent, held_since = CASE WHEN p_agent IS NULL THEN NULL ELSE now() END
   WHERE id = t.id;

  PERFORM public.log_audit_event('Terminals',
    CASE WHEN p_agent IS NULL THEN 'took terminal back from' WHEN t.held_by IS NULL THEN 'gave terminal to agent' ELSE 'moved terminal between agents' END,
    t.terminal_id, t.id::text, jsonb_build_object('heldBy', v_from), jsonb_build_object('heldBy', v_to), p_reason);
  RETURN jsonb_build_object('success', true, 'tid', t.terminal_id, 'heldBy', v_to);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_stock_move(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_move(uuid, uuid, text) TO authenticated;

-- The agent portal's stock shows when the agent was given each terminal.
CREATE OR REPLACE FUNCTION public.agent_stock()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x."terminalId") FROM (
    SELECT t.id, t.terminal_id AS "terminalId", t.device_model AS model, t.device_serial_number AS serial,
           coalesce(t.held_since, t.created_at) AS "collectedAt"
    FROM public.pos_terminals t WHERE t.held_by = auth.uid() AND t.merchant_id IS NULL AND t.is_active) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_stock() TO authenticated;
