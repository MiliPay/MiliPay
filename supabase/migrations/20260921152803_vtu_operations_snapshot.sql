-- Migration: 20260921152803_vtu_operations_snapshot.sql
-- Description:
--   One admin-only read that answers "is quick services healthy right now",
--   plus the manual resolution the sweep deliberately refuses to do itself.
--
--   A SECURITY DEFINER function rather than a set of views, because the
--   underlying tables are deliberately closed to `authenticated` and opening
--   them up to get a number onto a screen would be a strange trade. DEFINER
--   bypasses the policies, so the authorisation they express is restated
--   inside each function.
--
--   See supabase/functions/vtu-reconcile for the automated half. The split is
--   the point: the sweep handles what can be determined, and everything that
--   needs a judgement lands on the operations page with a person's name
--   attached to it.

CREATE OR REPLACE FUNCTION public.vtu_operations_snapshot(p_hours INTEGER DEFAULT 24)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_since  TIMESTAMPTZ := NOW() - make_interval(hours => GREATEST(1, LEAST(p_hours, 720)));
  v_result JSON;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.id = v_uid
      AND sp.role IN ('admin', 'super_admin')
      AND COALESCE(sp.status, '') = 'active'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'since', v_since,
    'generatedAt', NOW(),

    -- Volume and outcome over the window.
    'window', (
      SELECT json_build_object(
        'total',     COUNT(*),
        'delivered', COUNT(*) FILTER (WHERE status = 'delivered'),
        'failed',    COUNT(*) FILTER (WHERE status IN ('payment_failed', 'fulfilment_failed', 'refund_failed')),
        'refunded',  COUNT(*) FILTER (WHERE status = 'refunded'),
        'inFlight',  COUNT(*) FILTER (WHERE status IN ('initiated','paid','fulfilling','fulfilment_pending','refund_pending')),
        'value',     COALESCE(SUM(amount) FILTER (WHERE status = 'delivered'), 0),
        'margin',    COALESCE(SUM(fee_amount) FILTER (WHERE status = 'delivered'), 0)
      )
      FROM public.transactions WHERE created_at >= v_since
    ),

    -- The counts that mean somebody has to do something.
    'queues', (
      SELECT json_build_object(
        -- Customers waiting, money taken, nothing delivered yet.
        'pending', (SELECT COUNT(*) FROM public.transactions WHERE status = 'fulfilment_pending'),
        -- The dangerous subset: no operator id, so it cannot be requeried and
        -- must be resolved by hand on BigiSub's dashboard.
        'pendingUnresolvable', (
          SELECT COUNT(*) FROM public.transactions
          WHERE status = 'fulfilment_pending' AND operator_transaction_id IS NULL
        ),
        'refundsOpen', (SELECT COUNT(*) FROM public.refund_queue WHERE resolved_at IS NULL),
        'refundsFailed', (SELECT COUNT(*) FROM public.transactions WHERE status = 'refund_failed'),
        'quarantined', (SELECT COUNT(*) FROM public.transactions WHERE status = 'quarantined'),
        -- Anything non-terminal sitting for over an hour.
        'stuck', (
          SELECT COUNT(*) FROM public.transactions
          WHERE status IN ('initiated','paid','fulfilling','fulfilment_pending','refund_pending')
            AND updated_at < NOW() - INTERVAL '1 hour'
        )
      )
    ),

    -- Where the failures concentrate, so a broken provider is visible before
    -- the complaints arrive.
    'byService', (
      SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::json)
      FROM (
        SELECT service_type, provider,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
               COUNT(*) FILTER (WHERE status IN ('fulfilment_failed','refund_pending','refunded','refund_failed')) AS failed
        FROM public.transactions
        WHERE created_at >= v_since AND service_type IS NOT NULL
        GROUP BY service_type, provider
      ) s
    ),

    -- The transactions an operator should actually open.
    'attention', (
      SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.updated_at ASC), '[]'::json)
      FROM (
        SELECT reference, status, amount, service_type, provider,
               operator_transaction_id, failure_reason, updated_at
        FROM public.transactions
        WHERE status IN ('quarantined','refund_failed')
           OR (status IN ('initiated','paid','fulfilling','fulfilment_pending','refund_pending')
               AND updated_at < NOW() - INTERVAL '1 hour')
        ORDER BY updated_at ASC
        LIMIT 50
      ) a
    ),

    -- Biometric matching, on the same page rather than growing its own.
    'palm', (
      SELECT json_build_object(
        'events',     COUNT(*),
        'matched',    COUNT(*) FILTER (WHERE decision = 'matched'),
        'ambiguous',  COUNT(*) FILTER (WHERE decision = 'ambiguous'),
        'rejected',   COUNT(*) FILTER (WHERE decision = 'rejected'),
        -- The early warning. As the gallery grows, the gap between the best
        -- and second-best candidate shrinks; when it approaches the margin,
        -- the gallery has outgrown its threshold.
        'avgMargin',  ROUND(AVG(top_score - runner_up_score) FILTER (WHERE runner_up_score IS NOT NULL), 4),
        'minMargin',  ROUND(MIN(top_score - runner_up_score) FILTER (WHERE runner_up_score IS NOT NULL), 4),
        'gallerySize', MAX(gallery_size)
      )
      FROM public.palm_match_events WHERE occurred_at >= v_since
    ),

    'enrolment', (
      SELECT json_build_object(
        'customers',    (SELECT COUNT(*) FROM public.customers),
        'withTemplate', (SELECT COUNT(DISTINCT customer_id) FROM public.palm_templates WHERE retired_at IS NULL AND simulated = FALSE),
        'simulated',    (SELECT COUNT(*) FROM public.customers WHERE palm_simulated = TRUE)
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.vtu_operations_snapshot(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vtu_operations_snapshot(INTEGER) TO authenticated, service_role;


-- Manual resolution for the handful of things the sweep deliberately will not
-- decide by itself. Every use is recorded in transaction_events with the
-- administrator's id as the actor, because a human overriding the state
-- machine is exactly what an auditor will ask about.
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
  v_status  TEXT;
  v_id      UUID;
  v_amount  NUMERIC(12,2);
  v_target  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.id = v_uid
      AND sp.role IN ('admin', 'super_admin')
      AND COALESCE(sp.status, '') = 'active'
  ) THEN
    RAISE EXCEPTION 'Forbidden: only active administrators can resolve transactions';
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
    VALUES (v_id, p_reference, v_amount, COALESCE(p_note, 'resolved manually by an administrator'))
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
  VALUES (v_id, p_reference, v_status, v_target, p_note, v_uid::TEXT,
          json_build_object('manual', TRUE, 'action', p_action)::jsonb);

  RETURN json_build_object('success', TRUE, 'reference', p_reference, 'status', v_target);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_transaction(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_transaction(TEXT, TEXT, TEXT) TO authenticated, service_role;
