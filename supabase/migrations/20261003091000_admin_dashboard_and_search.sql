-- Admin dashboard and global search (portal design handoff).
--
-- - bank_name_mismatches: a self sign-up tried to link a bank account in
--   someone else's name and link-mono-account refused it.
-- - palm payments now record their platform fee on the row like quick
--   services do (process-payment); older rows fall back to the merchant's
--   current rate.
-- - admin_dashboard(range): everything on the admin Dashboard in one read.
-- - admin_search(q): the top-bar search across the console.

CREATE TABLE IF NOT EXISTS public.bank_name_mismatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  bank_name text,
  account_name text,
  customer_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_name_mismatches_customer_idx ON public.bank_name_mismatches (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_name_mismatches_created_idx ON public.bank_name_mismatches (created_at DESC);
ALTER TABLE public.bank_name_mismatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_name_mismatches FROM anon, authenticated;
GRANT SELECT ON public.bank_name_mismatches TO authenticated;
DROP POLICY IF EXISTS bank_name_mismatches_staff_read ON public.bank_name_mismatches;
CREATE POLICY bank_name_mismatches_staff_read ON public.bank_name_mismatches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff_profiles s WHERE s.id = auth.uid() AND s.role IN ('admin', 'super_admin', 'support')));
DROP POLICY IF EXISTS staff_two_factor ON public.bank_name_mismatches;
CREATE POLICY staff_two_factor ON public.bank_name_mismatches AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.staff_mfa_ok())) WITH CHECK ((SELECT public.staff_mfa_ok()));

CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Administrators only.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_staff_mfa();
END;
$$;
REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard(p_range text DEFAULT 'today')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_start timestamptz;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_bucket interval;
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF p_range = '7d' THEN
    v_start := v_now - interval '7 days';
    v_prev_start := v_now - interval '14 days';
    v_prev_end := v_start;
  ELSIF p_range = '30d' THEN
    v_start := v_now - interval '30 days';
    v_prev_start := v_now - interval '60 days';
    v_prev_end := v_start;
  ELSE
    v_start := date_trunc('day', v_now AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
    v_prev_start := v_start - interval '1 day';
    v_prev_end := v_now - interval '1 day';
  END IF;
  v_bucket := greatest((v_now - v_start) / 12, interval '1 minute');

  WITH tx AS (
    SELECT t.*,
      CASE WHEN t.merchant_id IS NOT NULL OR t.terminal_id IS NOT NULL THEN 'palm' ELSE coalesce(t.service_type, 'other') END AS svc,
      coalesce(t.fee_amount, CASE WHEN t.merchant_id IS NOT NULL THEN round(t.amount * coalesce(m.platform_fee_percent, 0) / 100, 2) END, 0) AS revenue,
      t.status IN ('initiated', 'paid', 'fulfilling', 'fulfilment_pending', 'refund_pending') AS in_flight
    FROM public.transactions t
    LEFT JOIN public.merchants m ON m.id = t.merchant_id
    WHERE t.created_at >= v_prev_start
  ),
  cur AS (SELECT * FROM tx WHERE created_at >= v_start),
  prev AS (SELECT * FROM tx WHERE created_at >= v_prev_start AND created_at < v_prev_end),
  kpi AS (
    SELECT
      (SELECT coalesce(sum(amount) FILTER (WHERE status = 'delivered'), 0) FROM cur) AS vol,
      (SELECT coalesce(sum(amount) FILTER (WHERE status = 'delivered'), 0) FROM prev) AS vol_prev,
      (SELECT coalesce(sum(revenue) FILTER (WHERE status = 'delivered'), 0) FROM cur) AS rev,
      (SELECT coalesce(sum(revenue) FILTER (WHERE status = 'delivered'), 0) FROM prev) AS rev_prev,
      (SELECT count(*) FROM cur) AS n,
      (SELECT count(*) FROM prev) AS n_prev,
      (SELECT count(*) FILTER (WHERE status = 'delivered') FROM cur) AS ok,
      (SELECT count(*) FILTER (WHERE NOT in_flight) FROM cur) AS finished,
      (SELECT count(*) FILTER (WHERE status = 'delivered') FROM prev) AS ok_prev,
      (SELECT count(*) FILTER (WHERE NOT in_flight) FROM prev) AS finished_prev
  ),
  buckets AS (
    SELECT b,
      coalesce(sum(c.amount) FILTER (WHERE c.status = 'delivered'), 0) AS vol,
      coalesce(sum(c.revenue) FILTER (WHERE c.status = 'delivered'), 0) AS rev,
      count(c.*) AS n,
      count(c.*) FILTER (WHERE c.status = 'delivered') AS ok,
      count(c.*) FILTER (WHERE NOT c.in_flight) AS finished
    FROM generate_series(0, 11) AS b
    LEFT JOIN cur c ON c.created_at >= v_start + v_bucket * b AND c.created_at < v_start + v_bucket * (b + 1)
    GROUP BY b
  ),
  hours AS (
    SELECT h,
      coalesce(sum(c.amount) FILTER (WHERE c.status = 'delivered'), 0) AS delivered,
      coalesce(sum(c.amount) FILTER (WHERE c.status IN ('payment_failed', 'fulfilment_failed', 'refund_pending', 'refunded', 'refund_failed', 'quarantined')), 0) AS failed
    FROM generate_series(0, 23) AS h
    LEFT JOIN cur c ON extract(hour FROM c.created_at AT TIME ZONE 'Africa/Lagos') = h
    GROUP BY h
  ),
  health AS (
    SELECT svc, coalesce(provider, '') AS provider, coalesce(fulfilment_provider, '') AS via,
      count(*) AS total,
      count(*) FILTER (WHERE status IN ('fulfilment_failed', 'refund_pending', 'refunded', 'refund_failed', 'quarantined')) AS failed,
      count(*) FILTER (WHERE status = 'delivered') AS ok
    FROM cur
    WHERE status <> 'payment_failed' AND NOT (in_flight AND status <> 'refund_pending')
    GROUP BY 1, 2, 3
    ORDER BY count(*) DESC
    LIMIT 6
  ),
  ss AS (
    SELECT s.*, c.onboarding_completed_at
    FROM public.signup_sessions s LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.created_at >= v_start
  )
  SELECT jsonb_build_object(
    'range', p_range,
    'generatedAt', v_now,
    'attention', jsonb_build_object(
      'stuck', (SELECT count(*) FROM public.transactions WHERE status IN ('fulfilment_pending', 'fulfilling')),
      'oldestStuckMinutes', (SELECT floor(extract(epoch FROM v_now - min(coalesce(updated_at, created_at))) / 60)
                               FROM public.transactions WHERE status IN ('fulfilment_pending', 'fulfilling')),
      'refunds', (SELECT count(*) FROM public.transactions WHERE status IN ('refund_pending', 'refund_failed')),
      'refundsFailed', (SELECT count(*) FROM public.transactions WHERE status = 'refund_failed'),
      'held', (SELECT count(*) FROM public.transactions WHERE status = 'quarantined'),
      'offline', (SELECT count(*) FROM public.pos_terminals
                  WHERE is_active AND (last_heartbeat IS NULL OR last_heartbeat < v_now - interval '15 minutes')),
      'tickets', (SELECT count(*) FROM public.support_tickets WHERE status <> 'resolved'),
      'ticketsCritical', (SELECT count(*) FROM public.support_tickets WHERE status <> 'resolved' AND urgency = 'critical'),
      'ticketsHigh', (SELECT count(*) FROM public.support_tickets WHERE status <> 'resolved' AND urgency = 'high'),
      'pending', (SELECT count(*) FROM public.customers WHERE status = 'pending'),
      'signups', (SELECT count(*) FROM public.signup_sessions WHERE step = 'review'),
      'mismatch', (SELECT count(*) FROM public.bank_name_mismatches WHERE created_at >= v_now - interval '7 days')
    ),
    'kpis', (SELECT jsonb_build_object(
      'volume', vol, 'volumePrev', vol_prev,
      'revenue', rev, 'revenuePrev', rev_prev,
      'count', n, 'countPrev', n_prev,
      'successRate', CASE WHEN finished > 0 THEN round(ok::numeric * 100 / finished, 1) END,
      'successRatePrev', CASE WHEN finished_prev > 0 THEN round(ok_prev::numeric * 100 / finished_prev, 1) END
    ) FROM kpi),
    'sparks', (SELECT jsonb_build_object(
      'volume', jsonb_agg(vol ORDER BY b),
      'revenue', jsonb_agg(rev ORDER BY b),
      'count', jsonb_agg(n ORDER BY b),
      'successRate', jsonb_agg(CASE WHEN finished > 0 THEN round(ok::numeric * 100 / finished, 1) END ORDER BY b)
    ) FROM buckets),
    'hourly', (SELECT jsonb_agg(jsonb_build_object('hour', h, 'delivered', delivered, 'failed', failed) ORDER BY h) FROM hours),
    'nowHour', extract(hour FROM v_now AT TIME ZONE 'Africa/Lagos')::int,
    'health', coalesce((SELECT jsonb_agg(jsonb_build_object('service', svc, 'provider', provider, 'via', via,
                          'total', total, 'failed', failed, 'ok', ok)) FROM health), '[]'::jsonb),
    'ledger', coalesce((SELECT jsonb_agg(row_to_json(l)) FROM (
        SELECT t.id, t.reference, t.amount, t.status, t.created_at AS "createdAt", t.merchant_name AS "merchantName",
          t.provider, t.service_type AS "serviceType",
          (t.merchant_id IS NOT NULL OR t.terminal_id IS NOT NULL) AS palm,
          trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS customer
        FROM public.transactions t LEFT JOIN public.customers c ON c.id = t.customer_id
        ORDER BY t.created_at DESC LIMIT 7) l), '[]'::jsonb),
    'funnel', (SELECT jsonb_build_array(
        count(*),
        count(*) FILTER (WHERE phone_verified_at IS NOT NULL),
        count(*) FILTER (WHERE nin IS NOT NULL),
        count(*) FILTER (WHERE id_full_name IS NOT NULL),
        count(*) FILTER (WHERE customer_id IS NOT NULL),
        count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)) FROM ss),
    'tiers', coalesce((SELECT jsonb_object_agg(kyc_tier, n) FROM (
        SELECT coalesce(kyc_tier, 1) AS kyc_tier, count(*) AS n FROM public.customers WHERE status = 'active' GROUP BY 1) x), '{}'::jsonb),
    'recentAudit', coalesce((SELECT jsonb_agg(row_to_json(a)) FROM (
        SELECT id, occurred_at AS "occurredAt", actor_name AS "actorName", actor_role AS "actorRole", category, action, target, result
        FROM public.audit_events ORDER BY id DESC LIMIT 6) a), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(text) TO authenticated;

-- Search the console. Phone numbers match with or without spaces or a +234;
-- four digits also match the last four of a NIN. Up to a handful per kind.
CREATE OR REPLACE FUNCTION public.admin_search(p_q text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text;
  v_digits text;
  v_local text;
BEGIN
  PERFORM public.assert_admin();
  IF length(v_q) < 2 THEN
    RETURN '{}'::jsonb;
  END IF;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits := regexp_replace(v_q, '\D', '', 'g');
  v_local := CASE WHEN v_digits LIKE '234%' AND length(v_digits) > 6 THEN '0' || substr(v_digits, 4) ELSE v_digits END;

  RETURN jsonb_build_object(
    'customers', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT id, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) AS name, phone, kyc_tier AS tier, status
      FROM public.customers
      WHERE (first_name || ' ' || coalesce(last_name, '')) ILIKE v_like
         OR (length(v_local) >= 4 AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') LIKE '%' || v_local || '%')
         OR (v_digits ~ '^\d{4}$' AND nin_last_4 = v_digits)
      ORDER BY created_at DESC LIMIT 4) x), '[]'::jsonb),
    'signups', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT id, coalesce(id_full_name, '') AS name, phone, step
      FROM public.signup_sessions
      WHERE coalesce(id_full_name, '') ILIKE v_like
         OR (length(v_local) >= 4 AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_local || '%')
      ORDER BY updated_at DESC LIMIT 3) x), '[]'::jsonb),
    'transactions', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT t.id, t.reference, t.amount, t.status,
        trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS customer
      FROM public.transactions t LEFT JOIN public.customers c ON c.id = t.customer_id
      WHERE t.reference ILIKE v_like
      ORDER BY t.created_at DESC LIMIT 4) x), '[]'::jsonb),
    'merchants', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT id, business_name AS name, cac_rc_number AS rc, state
      FROM public.merchants
      WHERE business_name ILIKE v_like OR coalesce(cac_rc_number, '') ILIKE v_like OR coalesce(director_name, '') ILIKE v_like
      ORDER BY created_at DESC LIMIT 3) x), '[]'::jsonb),
    'terminals', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT p.id, p.terminal_id AS "terminalId", p.device_serial_number AS serial, m.business_name AS merchant
      FROM public.pos_terminals p LEFT JOIN public.merchants m ON m.id = p.merchant_id
      WHERE p.terminal_id ILIKE v_like OR coalesce(p.device_serial_number, '') ILIKE v_like
      ORDER BY p.created_at DESC LIMIT 3) x), '[]'::jsonb),
    'tickets', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT k.id, k.ticket_id AS "ticketId", coalesce(k.subject, k.issue_description) AS subject, k.status,
        trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS customer
      FROM public.support_tickets k LEFT JOIN public.customers c ON c.id = k.customer_id
      WHERE coalesce(k.ticket_id, '') ILIKE v_like OR coalesce(k.subject, '') ILIKE v_like
         OR (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ILIKE v_like
      ORDER BY k.created_at DESC LIMIT 3) x), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search(text) TO authenticated;

-- Housekeeping flagged by the schema snapshot: notify_palm_settings() is a
-- trigger function and has no business being callable over the API.
REVOKE ALL ON FUNCTION public.notify_palm_settings() FROM PUBLIC, anon, authenticated;
