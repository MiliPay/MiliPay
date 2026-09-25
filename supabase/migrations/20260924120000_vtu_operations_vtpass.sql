-- Migration: 20260924120000_vtu_operations_vtpass.sql
-- Description:
--   Corrects the operations board after VTPass replaced BigiSub as the
--   fulfilment gateway.
--
--   The "Unresolvable" queue counted transactions with no
--   operator_transaction_id. That was the right question for BigiSub, whose
--   requery endpoint accepted nothing else — no id meant no answer and a human
--   had to go and look.
--
--   VTPass requery is keyed on request_id, which is derived from the reference
--   and the transaction's own timestamp. Both always exist, so every pending
--   transaction is now machine-resolvable and the old count would show a red
--   "resolve by hand" figure for work the sweep was already doing. Worse, it
--   invited an operator to mark something Delivered that VTPass had in fact
--   failed.
--
--   Redefined as what actually needs a person: pending for over 30 minutes,
--   meaning requery keeps asking and VTPass keeps not saying.
--
--   Only the one expression changes; the rest of the function is reproduced
--   verbatim because CREATE OR REPLACE needs the whole body.

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
        -- The subset a PERSON has to look at.
        --
        -- This used to mean "no operator_transaction_id", because BigiSub's
        -- requery was keyed on an id that only arrived in a response: a
        -- purchase whose call timed out could never be asked about. Under
        -- VTPass that category does not exist — the request_id is derived
        -- from the reference and the transaction's own timestamp, so the
        -- sweep can always ask. Left as it was, this tile flagged every
        -- timed-out purchase red and told an operator to resolve by hand
        -- transactions that were about to resolve themselves.
        --
        -- What genuinely needs a person now is a transaction where requery
        -- has been asking for a while and VTPass still will not say.
        'pendingUnresolvable', (
          SELECT COUNT(*) FROM public.transactions
          WHERE status = 'fulfilment_pending'
            AND updated_at < NOW() - INTERVAL '30 minutes'
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

-- The column comment still described BigiSub's requery key. VTPass does return
-- a transaction id, and it is worth keeping for reconciliation against their
-- dashboard, but it is no longer what makes a purchase resolvable.
COMMENT ON COLUMN public.transactions.operator_transaction_id IS
  'The gateway''s own transaction id, when one was returned. Useful for reconciling against the provider''s dashboard. NOT required to requery: VTPass is asked using request_id, derived from the reference and initiated_at.';
