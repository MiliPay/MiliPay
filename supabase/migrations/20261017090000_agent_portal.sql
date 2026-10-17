-- Agent portal redesign (agent-portal/design_handoff_agent): what the agent
-- dashboard, Find customer, My registrations, Earnings, Leaderboard and the
-- terminal stock read. Every function checks the caller is an agent (or an
-- admin) past their second factor; an agent sees their own work, their
-- state's leaderboard, and only what Find customer needs about anyone else.

-- ── Commission (placeholders: confirm the real rates) ──────────────────────
CREATE TABLE IF NOT EXISTS public.agent_commission_rates (
  kind text PRIMARY KEY CHECK (kind IN ('customer', 'upgrade', 'merchant')),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.agent_commission_rates (kind, amount) VALUES ('customer', 200), ('upgrade', 300), ('merchant', 1000)
ON CONFLICT (kind) DO NOTHING;
ALTER TABLE public.agent_commission_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_commission_rates FROM anon, authenticated;
GRANT ALL ON public.agent_commission_rates TO service_role;

-- Paid weekly (Fridays); recorded by finance.
CREATE TABLE IF NOT EXISTS public.agent_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  paid_at timestamptz,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_payouts_agent_idx ON public.agent_payouts (agent_id, period_end DESC);
ALTER TABLE public.agent_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_payouts FROM anon, authenticated;
GRANT ALL ON public.agent_payouts TO service_role;

-- ── Who upgraded a Tier 1 customer; an agent's terminal stock ─────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS upgraded_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upgraded_at timestamptz;
CREATE INDEX IF NOT EXISTS customers_upgraded_by_idx ON public.customers (upgraded_by, upgraded_at DESC);
CREATE INDEX IF NOT EXISTS customers_registered_by_idx ON public.customers (registered_by, created_at DESC);

-- A terminal in an agent's bag belongs to no merchant yet.
ALTER TABLE public.pos_terminals ALTER COLUMN merchant_id DROP NOT NULL;
ALTER TABLE public.pos_terminals ADD COLUMN IF NOT EXISTS held_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pos_terminals_held_by_idx ON public.pos_terminals (held_by) WHERE merchant_id IS NULL;

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rate(p_kind text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT amount FROM public.agent_commission_rates WHERE kind = p_kind), 0); $$;
REVOKE ALL ON FUNCTION public.agent_rate(text) FROM PUBLIC, anon, authenticated;

/** Commission an agent earned between two instants (approved work only). */
CREATE OR REPLACE FUNCTION public.agent_earned(p_agent uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH c AS (
    SELECT
      (SELECT count(*) FROM public.customers WHERE registered_by = p_agent AND status = 'active' AND verified_at >= p_from AND verified_at < p_to) AS customers,
      (SELECT count(*) FROM public.customers WHERE upgraded_by = p_agent AND upgraded_at >= p_from AND upgraded_at < p_to) AS upgrades,
      (SELECT count(*) FROM public.merchants WHERE onboarded_by = p_agent AND status = 'active' AND approved_at >= p_from AND approved_at < p_to) AS merchants
  )
  SELECT jsonb_build_object(
    'customers', customers, 'upgrades', upgrades, 'merchants', merchants,
    'total', customers * public.agent_rate('customer') + upgrades * public.agent_rate('upgrade') + merchants * public.agent_rate('merchant'))
  FROM c;
$$;
REVOKE ALL ON FUNCTION public.agent_earned(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── Dashboard ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_home()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
  v_me uuid := auth.uid();
  v_today timestamptz := public.lagos_today();
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_state text := (SELECT state FROM public.staff_profiles WHERE id = auth.uid());
  v_month_earned jsonb := public.agent_earned(auth.uid(), v_month, now() + interval '1 second');
  v_board jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(b) ORDER BY b.score DESC), '[]'::jsonb) INTO v_board FROM (
    SELECT s.id, (
      (SELECT count(*) FROM public.customers c WHERE c.registered_by = s.id AND c.created_at >= v_month)
      + (SELECT count(*) FROM public.customers c WHERE c.upgraded_by = s.id AND c.upgraded_at >= v_month)
      + (SELECT count(*) FROM public.merchants m WHERE m.onboarded_by = s.id AND m.created_at >= v_month)) AS score
    FROM public.staff_profiles s
    WHERE s.role = 'agent' AND coalesce(s.status, 'active') = 'active' AND s.state IS NOT DISTINCT FROM v_state) b;

  RETURN jsonb_build_object(
    'target', 12,
    'todayRegistrations', (SELECT count(*) FROM public.customers WHERE registered_by = v_me AND created_at >= v_today),
    'todayUpgrades', (SELECT count(*) FROM public.customers WHERE upgraded_by = v_me AND upgraded_at >= v_today),
    'earnings', jsonb_build_object(
      'month', v_month_earned -> 'total',
      'today', public.agent_earned(v_me, v_today, now() + interval '1 second') -> 'total',
      'pending', (SELECT count(*) FROM public.customers WHERE registered_by = v_me AND status = 'pending') * public.agent_rate('customer')
               + (SELECT count(*) FROM public.merchants WHERE onboarded_by = v_me AND status = 'pending') * public.agent_rate('merchant')),
    'rank', jsonb_build_object(
      'position', (SELECT ord FROM (SELECT id, row_number() OVER (ORDER BY score DESC) AS ord FROM jsonb_to_recordset(v_board) AS x(id uuid, score int)) r WHERE r.id = v_me),
      'total', jsonb_array_length(v_board),
      'state', v_state),
    'declined', coalesce((SELECT jsonb_agg(row_to_json(d)) FROM (
      SELECT id, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) AS name, rejection_reason AS reason, created_at AS "createdAt"
      FROM public.customers WHERE registered_by = v_me AND status = 'rejected' ORDER BY created_at DESC LIMIT 5) d), '[]'::jsonb),
    'tier1Nearby', coalesce((SELECT jsonb_agg(row_to_json(n)) FROM (
      SELECT id, coalesce(first_name, '') || coalesce(' ' || left(last_name, 1) || '.', '') AS name, right(phone, 4) AS "phoneLast4", lga, created_at AS "createdAt"
      FROM public.customers
      WHERE kyc_tier = 1 AND status = 'active' AND NOT coalesce(has_palm_template, false) AND state IS NOT DISTINCT FROM v_state
      ORDER BY created_at DESC LIMIT 5) n), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(row_to_json(r)) FROM (
      SELECT id, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) AS name, status, kyc_tier AS tier, created_at AS "createdAt"
      FROM public.customers WHERE registered_by = v_me ORDER BY created_at DESC LIMIT 6) r), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agent_home() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_home() TO authenticated;

-- ── Find customer: everyone on MiliPay, by phone, NIN last 4 or name ──────
CREATE OR REPLACE FUNCTION public.agent_find_customers(p_q text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
  v_q text := left(trim(coalesce(p_q, '')), 60);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 60), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
BEGIN
  IF length(v_q) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  IF v_digits LIKE '234%' AND length(v_digits) > 6 THEN
    v_digits := '0' || substr(v_digits, 4);
  END IF;
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
    SELECT c.id, trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS name,
      CASE WHEN c.registered_by = auth.uid() THEN c.phone ELSE '•••• ' || right(c.phone, 4) END AS phone, c.nin_last_4 AS "ninLast4",
      c.kyc_tier AS tier, c.status, c.state, coalesce(c.has_palm_template, false) AS palm,
      c.registered_by = auth.uid() AS mine, c.signup_source AS source, c.rejection_reason AS reason
    FROM public.customers c
    WHERE (trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ILIKE v_like)
       -- Phones are stored both as +234… and 0…; compare in the 0… form.
       OR (length(v_digits) >= 4 AND regexp_replace(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '^234', '0') LIKE '%' || v_digits || '%')
       OR (v_digits ~ '^\d{4}$' AND c.nin_last_4 = v_digits)
    ORDER BY c.created_at DESC
    LIMIT 25) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_find_customers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_find_customers(text) TO authenticated;

-- ── My registrations ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_registrations(p_tab text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x."at" DESC) FROM (
    SELECT c.id, trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS name,
      c.phone, c.nin_last_4 AS "ninLast4",
      CASE WHEN c.upgraded_by = auth.uid() AND c.registered_by IS DISTINCT FROM auth.uid() THEN 'upgrade' ELSE 'customer' END AS kind,
      c.status, c.kyc_tier AS tier, c.rejection_reason AS reason, coalesce(c.has_palm_template, false) AS palm,
      coalesce(c.has_face_template, false) AS face,
      CASE WHEN c.upgraded_by = auth.uid() AND c.registered_by IS DISTINCT FROM auth.uid() THEN public.agent_rate('upgrade') ELSE public.agent_rate('customer') END AS commission,
      coalesce(c.upgraded_at, c.created_at) AS "at", c.verified_at AS "approvedAt"
    FROM public.customers c
    WHERE (c.registered_by = auth.uid() OR c.upgraded_by = auth.uid())
      AND CASE p_tab
        WHEN 'pending' THEN c.status = 'pending'
        WHEN 'approved' THEN c.status = 'active'
        WHEN 'fix' THEN c.status = 'rejected'
        WHEN 'upgrades' THEN c.upgraded_by = auth.uid()
        ELSE true END
    LIMIT 300) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_registrations(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_registrations(text) TO authenticated;

-- ── Earnings ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_earnings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
  v_me uuid := auth.uid();
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_m jsonb := public.agent_earned(auth.uid(), v_month, now() + interval '1 second');
  v_lagos date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  RETURN jsonb_build_object(
    'today', public.agent_earned(v_me, public.lagos_today(), now() + interval '1 second') -> 'total',
    'month', v_m -> 'total',
    'pending', (SELECT count(*) FROM public.customers WHERE registered_by = v_me AND status = 'pending') * public.agent_rate('customer')
             + (SELECT count(*) FROM public.merchants WHERE onboarded_by = v_me AND status = 'pending') * public.agent_rate('merchant'),
    -- Paid on Fridays: the next one, today included.
    'nextPayout', v_lagos + ((5 - extract(isodow FROM v_lagos)::int + 7) % 7),
    'breakdown', jsonb_build_array(
      jsonb_build_object('kind', 'customer', 'count', v_m -> 'customers', 'rate', public.agent_rate('customer')),
      jsonb_build_object('kind', 'upgrade', 'count', v_m -> 'upgrades', 'rate', public.agent_rate('upgrade')),
      jsonb_build_object('kind', 'merchant', 'count', v_m -> 'merchants', 'rate', public.agent_rate('merchant'))),
    'payouts', coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p."periodEnd" DESC) FROM (
      SELECT amount, period_start AS "periodStart", period_end AS "periodEnd", paid_at AS "paidAt", reference
      FROM public.agent_payouts WHERE agent_id = v_me ORDER BY period_end DESC LIMIT 12) p), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agent_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_earnings() TO authenticated;

-- ── Leaderboard: agents in your state ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_leaderboard(p_period text DEFAULT 'week')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
  v_state text := (SELECT state FROM public.staff_profiles WHERE id = auth.uid());
  v_from timestamptz := CASE p_period
    WHEN 'today' THEN public.lagos_today()
    WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
    ELSE date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' END;
BEGIN
  RETURN jsonb_build_object('state', v_state, 'rows', coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x.total DESC, x.name) FROM (
    SELECT s.id, s.full_name AS name, s.state AS hub, s.id = auth.uid() AS me,
      (SELECT count(*) FROM public.customers c WHERE c.registered_by = s.id AND c.created_at >= v_from) AS customers,
      (SELECT count(*) FROM public.customers c WHERE c.upgraded_by = s.id AND c.upgraded_at >= v_from) AS upgrades,
      (SELECT count(*) FROM public.merchants m WHERE m.onboarded_by = s.id AND m.created_at >= v_from) AS merchants,
      (SELECT count(*) FROM public.customers c WHERE c.registered_by = s.id AND c.created_at >= v_from)
        + (SELECT count(*) FROM public.customers c WHERE c.upgraded_by = s.id AND c.upgraded_at >= v_from)
        + (SELECT count(*) FROM public.merchants m WHERE m.onboarded_by = s.id AND m.created_at >= v_from) AS total
    FROM public.staff_profiles s
    WHERE s.role = 'agent' AND coalesce(s.status, 'active') = 'active' AND s.state IS NOT DISTINCT FROM v_state
    LIMIT 100) x), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.agent_leaderboard(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_leaderboard(text) TO authenticated;

-- ── Terminal stock, and assigning one to a merchant ───────────────────────
CREATE OR REPLACE FUNCTION public.agent_stock()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x."terminalId") FROM (
    SELECT t.id, t.terminal_id AS "terminalId", t.device_model AS model, t.device_serial_number AS serial, t.created_at AS "collectedAt"
    FROM public.pos_terminals t WHERE t.held_by = auth.uid() AND t.merchant_id IS NULL AND t.is_active) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_stock() TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_assign_terminal(p_terminal uuid, p_merchant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['agent', 'admin', 'super_admin']);
  t public.pos_terminals%ROWTYPE;
  m public.merchants%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.pos_terminals WHERE id = p_terminal FOR UPDATE;
  IF t.id IS NULL OR t.merchant_id IS NOT NULL OR (v_role = 'agent' AND t.held_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'That terminal isn''t in your stock.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.merchants WHERE id = p_merchant;
  IF m.id IS NULL OR (v_role = 'agent' AND m.onboarded_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'You can only assign terminals to merchants you registered.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pos_terminals SET merchant_id = m.id, held_by = NULL, assigned_by = auth.uid() WHERE id = t.id;
  PERFORM public.log_audit_event('Terminals', 'assigned terminal', t.terminal_id, t.id::text,
    jsonb_build_object('heldBy', t.held_by), jsonb_build_object('merchant', m.business_name), NULL, 'success');
  RETURN jsonb_build_object('success', true, 'terminalId', t.terminal_id, 'merchant', m.business_name);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_assign_terminal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_assign_terminal(uuid, uuid) TO authenticated;

-- ── Upgrade to Tier 2: the SMS code an agent asks the customer for ────────
-- Only the agent-upgrade Edge Function (service role) reads or writes this.
CREATE TABLE IF NOT EXISTS public.agent_upgrade_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text,
  sent_at timestamptz,
  resends int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  code_verified_at timestamptz,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_upgrade_codes_customer_idx ON public.agent_upgrade_codes (customer_id, created_at DESC);
ALTER TABLE public.agent_upgrade_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_upgrade_codes FROM anon, authenticated;
GRANT ALL ON public.agent_upgrade_codes TO service_role;
