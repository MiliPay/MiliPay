-- Admin › Transactions, Operations and Audit log (portal design handoff).
--
-- - admin_transactions: the Transactions table with its tabs, service filter
--   and search, counted on the server.
-- - admin_transaction_detail: everything the side drawer shows.
-- - admin_resolve_transaction: now needs a reason, a passed second factor,
--   and writes the audit log in the same transaction as the change.
-- - admin_sweep_status: when the reconciliation sweep last ran.
-- - admin_audit_summary / verify_audit_chain: the Audit log page's numbers
--   and its tamper check.

CREATE OR REPLACE FUNCTION public.admin_transactions(
  p_tab text DEFAULT 'all',
  p_service text DEFAULT 'all',
  p_q text DEFAULT '',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();

  WITH base AS (
    SELECT t.*,
      (t.merchant_id IS NOT NULL OR t.terminal_id IS NOT NULL) AS palm,
      coalesce(t.fee_amount, CASE WHEN t.merchant_id IS NOT NULL THEN round(t.amount * coalesce(m.platform_fee_percent, 0) / 100, 2) END, 0) AS fee,
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS customer_name,
      CASE
        WHEN t.status = 'delivered' THEN 'delivered'
        WHEN t.status IN ('initiated', 'paid', 'fulfilling', 'fulfilment_pending') THEN 'flight'
        WHEN t.status IN ('payment_failed', 'fulfilment_failed') THEN 'failed'
        WHEN t.status IN ('refund_pending', 'refunded', 'refund_failed') THEN 'refunds'
        WHEN t.status = 'quarantined' THEN 'held'
        ELSE 'other'
      END AS tab
    FROM public.transactions t
    LEFT JOIN public.customers c ON c.id = t.customer_id
    LEFT JOIN public.merchants m ON m.id = t.merchant_id
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_service = 'all'
           OR (p_service = 'palm' AND b.palm)
           OR (p_service <> 'palm' AND NOT b.palm AND b.service_type = p_service))
      AND (v_q = '' OR b.reference ILIKE v_like OR coalesce(b.merchant_name, '') ILIKE v_like OR b.customer_name ILIKE v_like)
  ),
  tabbed AS (
    SELECT * FROM filtered WHERE p_tab = 'all' OR tab = p_tab
  )
  SELECT jsonb_build_object(
    'counts', (SELECT jsonb_build_object(
        'all', count(*),
        'delivered', count(*) FILTER (WHERE tab = 'delivered'),
        'flight', count(*) FILTER (WHERE tab = 'flight'),
        'failed', count(*) FILTER (WHERE tab = 'failed'),
        'refunds', count(*) FILTER (WHERE tab = 'refunds'),
        'held', count(*) FILTER (WHERE tab = 'held')) FROM filtered),
    'total', (SELECT count(*) FROM tabbed),
    'amount', (SELECT coalesce(sum(amount), 0) FROM tabbed),
    'rows', coalesce((SELECT jsonb_agg(row_to_json(r)) FROM (
      SELECT id, reference, amount, fee, status, created_at AS "createdAt", palm, service_type AS "serviceType",
        provider, merchant_name AS "merchantName", customer_name AS customer, customer_id AS "customerId"
      FROM tabbed
      ORDER BY created_at DESC
      OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 100)) r), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_transactions(text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transactions(text, text, text, integer, integer) TO authenticated;

-- One transaction, by id or reference, with what is connected to it.
CREATE OR REPLACE FUNCTION public.admin_transaction_detail(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_tx FROM public.transactions
  WHERE reference = p_key OR (p_key ~* '^[0-9a-f-]{36}$' AND id = p_key::uuid)
  LIMIT 1;
  IF v_tx.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', v_tx.id,
    'reference', v_tx.reference,
    'amount', v_tx.amount,
    'baseAmount', v_tx.base_amount,
    'fee', coalesce(v_tx.fee_amount, CASE WHEN v_tx.merchant_id IS NOT NULL
             THEN round(v_tx.amount * coalesce((SELECT platform_fee_percent FROM public.merchants WHERE id = v_tx.merchant_id), 0) / 100, 2) END),
    'serviceCharge', v_tx.service_charge,
    'status', v_tx.status,
    'palm', v_tx.merchant_id IS NOT NULL OR v_tx.terminal_id IS NOT NULL,
    'serviceType', v_tx.service_type,
    'provider', v_tx.provider,
    'via', v_tx.fulfilment_provider,
    'beneficiary', v_tx.beneficiary,
    'merchantName', v_tx.merchant_name,
    'terminalId', v_tx.terminal_id,
    'operatorReference', coalesce(v_tx.operator_reference, v_tx.operator_transaction_id),
    'paymentProvider', v_tx.payment_provider,
    'paymentReference', coalesce(v_tx.payment_reference, v_tx.mono_payment_id),
    'failureReason', v_tx.failure_reason,
    'createdAt', v_tx.created_at,
    'initiatedAt', v_tx.initiated_at,
    'paidAt', v_tx.paid_at,
    'fulfilledAt', v_tx.fulfilled_at,
    'refundedAt', v_tx.refunded_at,
    'updatedAt', v_tx.updated_at,
    'customer', (SELECT jsonb_build_object('id', c.id, 'name', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
                   'tier', c.kyc_tier, 'phone', c.phone)
                 FROM public.customers c WHERE c.id = v_tx.customer_id),
    'merchant', (SELECT jsonb_build_object('id', m.id, 'name', m.business_name) FROM public.merchants m WHERE m.id = v_tx.merchant_id),
    'account', (SELECT jsonb_build_object('bank', a.bank_name, 'last4', right(a.account_number, 4))
                FROM public.linked_accounts a WHERE a.id = v_tx.account_used),
    'refund', (SELECT jsonb_build_object('attempts', q.attempts, 'lastError', q.last_error, 'resolvedAt', q.resolved_at)
               FROM public.refund_queue q WHERE q.transaction_id = v_tx.id ORDER BY q.created_at DESC LIMIT 1),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('from', e.from_status, 'to', e.to_status, 'reason', e.reason,
                          'actor', e.actor, 'at', e.occurred_at) ORDER BY e.occurred_at)
                        FROM public.transaction_events e WHERE e.transaction_id = v_tx.id), '[]'::jsonb),
    'audit', coalesce((SELECT jsonb_agg(jsonb_build_object('actorName', a.actor_name, 'action', a.action, 'reason', a.reason,
                         'at', a.occurred_at) ORDER BY a.id DESC)
                       FROM public.audit_events a WHERE a.target_id = v_tx.id::text OR a.target = v_tx.reference), '[]'::jsonb),
    'tickets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'ticketId', k.ticket_id, 'subject', coalesce(k.subject, k.issue_description)))
                         FROM public.support_tickets k WHERE k.customer_id = v_tx.customer_id AND k.status <> 'resolved'), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_transaction_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transaction_detail(text) TO authenticated;

-- Same transitions as before; now a reason is required and the decision is
-- written to the audit log in the same transaction as the change.
CREATE OR REPLACE FUNCTION public.admin_resolve_transaction(
  p_reference TEXT,
  p_action    TEXT,
  p_note      TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_staff   record;
  v_status  TEXT;
  v_id      UUID;
  v_amount  NUMERIC(12,2);
  v_target  TEXT;
  v_note    TEXT := nullif(trim(coalesce(p_note, '')), '');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, full_name, role INTO v_staff FROM public.staff_profiles sp
  WHERE sp.id = v_uid AND sp.role IN ('admin', 'super_admin') AND COALESCE(sp.status, '') = 'active';
  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: only active administrators can resolve transactions';
  END IF;
  PERFORM public.assert_staff_mfa();

  IF v_note IS NULL OR length(v_note) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit trail.' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, amount INTO v_id, v_status, v_amount
    FROM public.transactions WHERE reference = p_reference;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Unknown reference';
  END IF;

  -- Only the transitions the machine already permits. An administrator may
  -- decide between two legal outcomes; they may not invent a third.
  IF p_action = 'mark_delivered' THEN
    IF v_status NOT IN ('fulfilment_pending', 'quarantined') THEN
      RAISE EXCEPTION 'Cannot mark % as delivered', v_status;
    END IF;
    v_target := 'delivered';

  ELSIF p_action = 'refund' THEN
    IF v_status NOT IN ('fulfilment_pending', 'quarantined', 'refund_failed', 'fulfilment_failed') THEN
      RAISE EXCEPTION 'Cannot refund from %', v_status;
    END IF;
    v_target := 'refund_pending';

    INSERT INTO public.refund_queue (transaction_id, reference, amount, reason)
    VALUES (v_id, p_reference, v_amount, v_note)
    ON CONFLICT (transaction_id) WHERE resolved_at IS NULL DO UPDATE
      SET next_attempt_at = NOW(), attempts = 0, last_error = NULL;

  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  UPDATE public.transactions
     SET status = v_target, updated_at = NOW(),
         fulfilled_at = CASE WHEN v_target = 'delivered' THEN NOW() ELSE fulfilled_at END
   WHERE id = v_id;

  INSERT INTO public.transaction_events (transaction_id, reference, from_status, to_status, reason, actor, metadata)
  VALUES (v_id, p_reference, v_status, v_target, v_note, v_uid::TEXT,
          json_build_object('manual', TRUE, 'action', p_action)::jsonb);

  INSERT INTO public.audit_events
    (actor_id, actor_name, actor_role, category, action, target, target_id, reason, before, after, ip, user_agent, session_id, hash)
  VALUES (
    v_uid, coalesce(v_staff.full_name, 'Staff'), v_staff.role, 'Transactions',
    CASE WHEN p_action = 'refund' THEN 'refunded' ELSE 'marked delivered' END,
    p_reference, v_id::text, v_note,
    jsonb_build_object('status', v_status), jsonb_build_object('status', v_target),
    left(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), 64),
    left(v_headers ->> 'user-agent', 300), auth.jwt() ->> 'session_id', '');

  RETURN json_build_object('success', TRUE, 'reference', p_reference, 'status', v_target);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_transaction(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_transaction(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- When the reconciliation sweep (pg_cron job vtu-requery, every 2 minutes)
-- last finished, and how.
CREATE OR REPLACE FUNCTION public.admin_sweep_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  SELECT jsonb_build_object('lastRunAt', d.end_time, 'status', d.status, 'everyMinutes', 2)
    INTO v_out
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'vtu-requery' AND d.end_time IS NOT NULL
  ORDER BY d.end_time DESC LIMIT 1;
  RETURN coalesce(v_out, jsonb_build_object('lastRunAt', NULL, 'status', NULL, 'everyMinutes', 2));
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
  RETURN jsonb_build_object('lastRunAt', NULL, 'status', NULL, 'everyMinutes', 2);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sweep_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sweep_status() TO authenticated;

-- The four numbers at the top of the Audit log, for today in Lagos.
CREATE OR REPLACE FUNCTION public.admin_audit_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  PERFORM public.assert_admin();
  RETURN jsonb_build_object(
    'eventsToday', (SELECT count(*) FROM public.audit_events WHERE occurred_at >= v_today),
    'sensitiveToday', (SELECT count(*) FROM public.audit_events
                       WHERE occurred_at >= v_today AND category IN ('Transactions', 'Settings', 'Staff', 'Customers', 'Sign-ups', 'Merchants', 'Terminals')
                         AND action NOT LIKE 'exported%' AND action NOT LIKE 'viewed%'),
    'deniedToday', (SELECT count(*) FROM public.audit_events WHERE occurred_at >= v_today AND result = 'denied'),
    'activeStaffToday', (SELECT count(DISTINCT actor_id) FROM public.audit_events WHERE occurred_at >= v_today AND actor_id IS NOT NULL)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_audit_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_summary() TO authenticated;

-- Recompute every hash in order. Any edit, deletion or reordering shows up as
-- the first row that no longer matches.
CREATE OR REPLACE FUNCTION public.verify_audit_chain()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bad bigint;
  v_n bigint;
BEGIN
  PERFORM public.assert_admin();
  SELECT count(*) INTO v_n FROM public.audit_events;
  SELECT id INTO v_bad FROM (
    SELECT e.id, e.hash, e.prev_hash, lag(e.hash) OVER (ORDER BY e.id) AS expected_prev, public.audit_event_hash(e) AS recomputed
    FROM public.audit_events e
  ) x
  WHERE x.hash <> x.recomputed OR x.prev_hash IS DISTINCT FROM x.expected_prev
  ORDER BY id LIMIT 1;
  RETURN jsonb_build_object('ok', v_bad IS NULL, 'checked', v_n, 'firstBadId', v_bad);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_audit_chain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain() TO authenticated;
