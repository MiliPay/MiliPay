-- Merchants, merchant profile and POS terminals (portal design handoff, step 5).
--
-- - staff_merchants / staff_merchant_detail: the Merchants list and a
--   merchant's page in one read each. Admins see every merchant; an agent
--   sees the merchants they registered.
-- - admin_terminals: the Terminals page (admins).
-- - admin_merchant_action: approve, suspend, reactivate and fee changes,
--   each with a reason and an audit entry in the same transaction.
-- - admin_set_terminal_active / admin_add_terminal: the same for terminals.
-- - Clients can no longer write either table directly. Every change goes
--   through the functions above or the onboard-merchant Edge Function, so
--   none of them escapes the audit log. The director's BVN and the terminal
--   key hash are no longer readable from the portals at all; the profile
--   shows the BVN's last four.

ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS settlement_name_checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.staff_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_merchant_created_idx
  ON public.transactions (merchant_id, created_at DESC) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_terminal_created_idx
  ON public.transactions (terminal_id, created_at DESC) WHERE terminal_id IS NOT NULL;

-- ── Who can touch the tables ───────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.merchants FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.merchants FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, business_name, category, address, state, cac_rc_number, director_name, director_phone, email,
  auth_user_id, settlement_bank_name, settlement_bank_code, settlement_account_number, settlement_account_name,
  settlement_name_checked, mono_subaccount_id, platform_fee_percent, settlement_schedule, status, onboarded_by,
  approved_at, approved_by, created_at, updated_at
) ON public.merchants TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.pos_terminals FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.pos_terminals FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, terminal_id, merchant_id, device_serial_number, device_model, is_active, last_heartbeat, assigned_by, created_at
) ON public.pos_terminals TO authenticated;

-- The old unaudited write paths. Nothing in the portals calls them now.
REVOKE ALL ON FUNCTION public.admin_update_merchant_controls(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_merchant_controls(uuid, text, numeric) TO service_role;
DO $$
BEGIN
  IF to_regprocedure('public.delete_merchant_cascade(uuid)') IS NOT NULL THEN
    -- Deleting a merchant cuts its payments off from who received them.
    EXECUTE 'REVOKE ALL ON FUNCTION public.delete_merchant_cascade(uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_merchant_cascade(uuid) TO service_role';
  END IF;
END;
$$;

-- ── Shared pieces ──────────────────────────────────────────────────────
-- Online: active and heard from in the last 15 minutes.
CREATE OR REPLACE FUNCTION public.terminal_state(p_active boolean, p_heartbeat timestamptz)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN NOT p_active THEN 'inactive'
    WHEN p_heartbeat IS NOT NULL AND p_heartbeat >= now() - interval '15 minutes' THEN 'online'
    ELSE 'offline'
  END;
$$;

CREATE OR REPLACE FUNCTION public.lagos_today()
RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
  SELECT date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
$$;

-- ── Merchants list ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_merchants(p_status text DEFAULT 'all', p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['admin', 'super_admin', 'agent']);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_since timestamptz := now() - interval '30 days';
BEGIN
  RETURN (
    WITH mine AS (
      SELECT m.* FROM public.merchants m
      WHERE v_role <> 'agent' OR m.onboarded_by = auth.uid()
    ), money AS (
      SELECT t.merchant_id,
             sum(t.amount) AS volume,
             sum(coalesce(t.fee_amount, round(t.amount * coalesce(m.platform_fee_percent, 0) / 100, 2))) AS fees
      FROM public.transactions t JOIN mine m ON m.id = t.merchant_id
      WHERE t.created_at >= v_since AND t.status IN ('delivered', 'success', 'completed')
      GROUP BY t.merchant_id
    ), terms AS (
      SELECT p.merchant_id,
             count(*) AS total,
             count(*) FILTER (WHERE public.terminal_state(p.is_active, p.last_heartbeat) = 'online') AS online,
             count(*) FILTER (WHERE public.terminal_state(p.is_active, p.last_heartbeat) = 'offline') AS offline
      FROM public.pos_terminals p JOIN mine m ON m.id = p.merchant_id
      GROUP BY p.merchant_id
    )
    SELECT jsonb_build_object(
      'stats', jsonb_build_object(
        'active', (SELECT count(*) FROM mine WHERE status = 'active'),
        'volume', (SELECT coalesce(sum(volume), 0) FROM money),
        'fees', (SELECT coalesce(sum(fees), 0) FROM money),
        'pending', (SELECT count(*) FROM mine WHERE status = 'pending')
      ),
      'rows', coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x."createdAt" DESC) FROM (
          SELECT m.id, m.business_name AS name, m.category, m.state, m.status,
                 m.platform_fee_percent AS fee, m.settlement_schedule AS schedule, m.created_at AS "createdAt",
                 coalesce(tr.total, 0) AS terminals, coalesce(tr.online, 0) AS online, coalesce(tr.offline, 0) AS offline,
                 coalesce(mo.volume, 0) AS volume
          FROM mine m
          LEFT JOIN terms tr ON tr.merchant_id = m.id
          LEFT JOIN money mo ON mo.merchant_id = m.id
          WHERE (coalesce(p_status, 'all') = 'all' OR m.status = p_status)
            AND (trim(coalesce(p_q, '')) = '' OR m.business_name ILIKE v_like OR m.director_name ILIKE v_like)
          ORDER BY m.created_at DESC
          LIMIT 500
        ) x
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_merchants(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_merchants(text, text) TO authenticated;

-- ── One merchant ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_merchant_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['admin', 'super_admin', 'agent']);
  v_m public.merchants%ROWTYPE;
  v_today timestamptz := public.lagos_today();
  v_since timestamptz := now() - interval '30 days';
BEGIN
  SELECT * INTO v_m FROM public.merchants WHERE id = p_id;
  IF v_m.id IS NULL OR (v_role = 'agent' AND v_m.onboarded_by IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_m.id,
    'name', v_m.business_name,
    'category', v_m.category,
    'address', v_m.address,
    'state', v_m.state,
    'cac', v_m.cac_rc_number,
    'status', v_m.status,
    'director', v_m.director_name,
    'directorPhone', CASE WHEN length(v_m.director_phone) >= 8
                          THEN left(v_m.director_phone, 4) || ' ••• ' || right(v_m.director_phone, 4) END,
    'bvnLast4', CASE WHEN v_m.director_bvn IS NOT NULL THEN right(v_m.director_bvn, 4) END,
    'email', v_m.email,
    'hasLogin', v_m.auth_user_id IS NOT NULL,
    'bank', v_m.settlement_bank_name,
    'accountNumber', v_m.settlement_account_number,
    'accountName', v_m.settlement_account_name,
    'accountNameChecked', v_m.settlement_name_checked,
    'schedule', v_m.settlement_schedule,
    'fee', v_m.platform_fee_percent,
    'monoSubaccount', v_m.mono_subaccount_id,
    'createdAt', v_m.created_at,
    'approvedAt', v_m.approved_at,
    'approvedBy', (SELECT full_name FROM public.staff_profiles WHERE id = v_m.approved_by),
    'onboardedBy', (SELECT jsonb_build_object('name', full_name, 'role', role) FROM public.staff_profiles WHERE id = v_m.onboarded_by),
    'volume', (SELECT coalesce(sum(amount), 0) FROM public.transactions
               WHERE merchant_id = v_m.id AND created_at >= v_since AND status IN ('delivered', 'success', 'completed')),
    'fees', (SELECT coalesce(sum(coalesce(fee_amount, round(amount * v_m.platform_fee_percent / 100, 2))), 0) FROM public.transactions
             WHERE merchant_id = v_m.id AND created_at >= v_since AND status IN ('delivered', 'success', 'completed')),
    'paymentsToday', (SELECT count(*) FROM public.transactions
                      WHERE merchant_id = v_m.id AND created_at >= v_today AND status IN ('delivered', 'success', 'completed')),
    'terminals', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.tid) FROM (
        SELECT p.id, p.terminal_id AS tid, p.device_model AS model, p.device_serial_number AS serial,
               p.is_active AS active, p.last_heartbeat AS "lastHeartbeat",
               public.terminal_state(p.is_active, p.last_heartbeat) AS state,
               (SELECT count(*) FROM public.transactions t
                 WHERE t.terminal_id = p.terminal_id AND t.created_at >= v_today AND t.status IN ('delivered', 'success', 'completed')) AS "txnsToday",
               (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t
                 WHERE t.terminal_id = p.terminal_id AND t.created_at >= v_today AND t.status IN ('delivered', 'success', 'completed')) AS "volumeToday"
        FROM public.pos_terminals p WHERE p.merchant_id = v_m.id
      ) x
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_merchant_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_merchant_detail(uuid) TO authenticated;

-- ── Terminals ──────────────────────────────────────────────────────────
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
      FROM public.pos_terminals p LEFT JOIN public.merchants m ON m.id = p.merchant_id
    )
    SELECT jsonb_build_object(
      'counts', jsonb_build_object(
        'all', (SELECT count(*) FROM t),
        'online', (SELECT count(*) FROM t WHERE state = 'online'),
        'offline', (SELECT count(*) FROM t WHERE state = 'offline'),
        'inactive', (SELECT count(*) FROM t WHERE state = 'inactive')
      ),
      'paymentsToday', (SELECT coalesce(sum("txnsToday"), 0) FROM t),
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

-- ── Merchant actions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_merchant_action(
  p_id uuid,
  p_action text,
  p_reason text,
  p_fee numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_m public.merchants%ROWTYPE;
  v_from text;
  v_to text;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_m FROM public.merchants WHERE id = p_id FOR UPDATE;
  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'That merchant was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'fee' THEN
    IF p_fee IS NULL OR p_fee <= 0 OR p_fee > 5 THEN
      RAISE EXCEPTION 'Fee must be between 0 and 5%%.' USING ERRCODE = '22023';
    END IF;
    IF p_fee = v_m.platform_fee_percent THEN
      RAISE EXCEPTION 'That is already the fee.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.merchants SET platform_fee_percent = p_fee, updated_at = now() WHERE id = p_id;
    PERFORM public.log_audit_event('Merchants', 'changed fee for', v_m.business_name, p_id::text,
      jsonb_build_object('platformFeePercent', v_m.platform_fee_percent),
      jsonb_build_object('platformFeePercent', p_fee), p_reason);
    RETURN jsonb_build_object('success', true, 'fee', p_fee);
  END IF;

  v_from := CASE p_action WHEN 'approve' THEN 'pending' WHEN 'suspend' THEN 'active' WHEN 'reactivate' THEN 'suspended' END;
  v_to := CASE p_action WHEN 'suspend' THEN 'suspended' ELSE 'active' END;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
  END IF;
  IF v_m.status <> v_from THEN
    RAISE EXCEPTION '%', CASE p_action
      WHEN 'approve' THEN 'Only a pending merchant can be approved.'
      WHEN 'suspend' THEN 'Only an active merchant can be suspended.'
      ELSE 'Only a suspended merchant can be reactivated.' END
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.merchants
     SET status = v_to,
         approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE approved_at END,
         approved_by = CASE WHEN p_action = 'approve' THEN auth.uid() ELSE approved_by END,
         updated_at = now()
   WHERE id = p_id;

  PERFORM public.log_audit_event('Merchants',
    CASE p_action WHEN 'approve' THEN 'approved merchant' WHEN 'suspend' THEN 'suspended merchant' ELSE 'reactivated merchant' END,
    v_m.business_name, p_id::text,
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', v_to), p_reason);
  RETURN jsonb_build_object('success', true, 'status', v_to);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_merchant_action(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_merchant_action(uuid, text, text, numeric) TO authenticated;

-- ── Terminal actions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_terminal_active(p_id uuid, p_active boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t public.pos_terminals%ROWTYPE;
  v_merchant text;
BEGIN
  PERFORM public.assert_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit log.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_t FROM public.pos_terminals WHERE id = p_id FOR UPDATE;
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'That terminal was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_t.is_active = p_active THEN
    RAISE EXCEPTION '%', CASE WHEN p_active THEN 'That terminal is already active.' ELSE 'That terminal is already deactivated.' END
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.pos_terminals SET is_active = p_active WHERE id = p_id;
  SELECT business_name INTO v_merchant FROM public.merchants WHERE id = v_t.merchant_id;
  PERFORM public.log_audit_event('Terminals',
    CASE WHEN p_active THEN 'reactivated terminal' ELSE 'deactivated terminal' END,
    v_t.terminal_id, p_id::text,
    jsonb_build_object('isActive', v_t.is_active, 'merchant', v_merchant),
    jsonb_build_object('isActive', p_active), p_reason);
  RETURN jsonb_build_object('success', true, 'active', p_active);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_terminal_active(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_terminal_active(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_terminal(p_merchant uuid, p_tid text, p_serial text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tid text := upper(trim(coalesce(p_tid, '')));
  v_serial text := trim(coalesce(p_serial, ''));
  v_name text;
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();
  IF v_tid !~ '^[A-Z0-9][A-Z0-9-]{2,39}$' THEN
    RAISE EXCEPTION 'Enter the terminal ID printed on the device, like TRM-1234.' USING ERRCODE = '22023';
  END IF;
  IF length(v_serial) < 3 THEN
    RAISE EXCEPTION 'Enter the serial number.' USING ERRCODE = '22023';
  END IF;
  SELECT business_name INTO v_name FROM public.merchants WHERE id = p_merchant;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'That merchant was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_terminals WHERE terminal_id = v_tid) THEN
    RAISE EXCEPTION 'Terminal % is already assigned to a merchant.', v_tid USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_terminals WHERE device_serial_number = v_serial) THEN
    RAISE EXCEPTION 'A terminal with that serial number is already registered.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pos_terminals (terminal_id, merchant_id, device_serial_number, device_model, is_active, assigned_by)
  VALUES (v_tid, p_merchant, v_serial, left(trim(coalesce(p_model, '')), 80), true, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event('Terminals', 'assigned terminal', v_tid, v_id::text, NULL,
    jsonb_build_object('merchant', v_name, 'serial', v_serial, 'model', p_model), NULL);
  RETURN jsonb_build_object('success', true, 'id', v_id, 'tid', v_tid);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_add_terminal(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_terminal(uuid, text, text, text) TO authenticated;
