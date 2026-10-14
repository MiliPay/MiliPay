-- Support portal (design handoff, MiliPay Support.dc.html): the complaints
-- desk, its customer panel, the call log and saved replies.
--
-- 1. support_tickets: the channel (chat from the app, or a call or email
--    logged by an agent), when it was first answered (the SLA clock), when
--    staff last read it (unread counts), and who it is about when that is not
--    a customer yet (a caller still signing up).
-- 2. ticket_messages: internal notes, logged calls and staff-only events
--    ("Handed over to Ifeoma", "Refund requested"). The customer's app can't
--    read them: its policy only shows customer, staff and system lines, and
--    realtime follows that policy.
-- 3. support_presence: online / away / offline, for routing and the team list.
-- 4. saved_replies (+ uses): the team's shared replies.
-- 5. refund_requests: support cannot move money. A request waits for an admin
--    in Operations, whose decision goes through admin_resolve_transaction.
-- 6. signup_sessions: "ask admin to prioritise" and a NIN that was refused
--    because another account holds it; fraud_reports for the fraud team.
-- 7. The desk's RPCs. Every one checks the caller is support (or an admin)
--    past their second factor. Handovers and refund requests are audited;
--    account help (SMS, codes, fraud reports) runs in the support-desk Edge
--    Function, which audits too.

-- ── 1. Tickets ──────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS first_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS signup_session_id uuid REFERENCES public.signup_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel IN ('chat', 'call', 'email', 'walk_in'));

-- Clients held table-wide rights, so a customer's own insert could have set
-- the new columns (a channel, someone else's sign-up). Writes are now limited
-- to the columns the app and the older portal pages use; the desk writes the
-- rest through its functions. TRUNCATE was never meant for clients.
REVOKE INSERT, UPDATE, TRUNCATE ON public.support_tickets FROM anon, authenticated;
GRANT INSERT (customer_id, issue_description, created_by, status, urgency, is_escalated, subject,
              solved_by, resolved_at, started_at, assigned_to)
  ON public.support_tickets TO authenticated;
GRANT UPDATE (status, urgency, assigned_to, started_at, resolved_at, solved_by, is_escalated, subject, updated_at)
  ON public.support_tickets TO authenticated;

CREATE INDEX IF NOT EXISTS support_tickets_open_idx ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_customer_idx ON public.support_tickets (customer_id);

-- ── 2. Messages ─────────────────────────────────────────────────────────
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS meta jsonb;
ALTER TABLE public.ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_sender_type_check;
ALTER TABLE public.ticket_messages ADD CONSTRAINT ticket_messages_sender_type_check
  CHECK (sender_type IN ('customer', 'staff', 'system', 'note', 'call', 'event'));
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON public.ticket_messages (ticket_id, created_at);

-- The customer reads their own conversation, never the team's notes.
DROP POLICY IF EXISTS "Customers can view own messages" ON public.ticket_messages;
CREATE POLICY "Customers can view own messages"
  ON public.ticket_messages
  FOR SELECT
  USING (
    sender_type IN ('customer', 'staff', 'system')
    AND ticket_id IN (
      SELECT support_tickets.id FROM public.support_tickets
       WHERE support_tickets.created_by = auth.uid()
          OR support_tickets.customer_id IN (SELECT customers.id FROM public.customers WHERE customers.auth_user_id = auth.uid())
    )
  );

-- Nothing edits a message once written, and a client's message is just text.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ticket_messages FROM anon, authenticated;
GRANT INSERT (ticket_id, sender_id, sender_type, content) ON public.ticket_messages TO authenticated;

-- Every message moves its ticket up the queue; the first staff reply stops
-- the first-reply clock.
CREATE OR REPLACE FUNCTION public.touch_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET updated_at = now(),
         first_replied_at = CASE WHEN NEW.sender_type = 'staff' THEN coalesce(first_replied_at, NEW.created_at) ELSE first_replied_at END
   WHERE id = NEW.ticket_id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[touch_ticket_on_message] %', SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_ticket_on_message() FROM PUBLIC, anon, authenticated;

UPDATE public.support_tickets k
   SET first_replied_at = (SELECT min(m.created_at) FROM public.ticket_messages m WHERE m.ticket_id = k.id AND m.sender_type = 'staff')
 WHERE k.first_replied_at IS NULL;

-- ── 3. Presence ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_presence (
  staff_id uuid PRIMARY KEY REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_presence FROM anon, authenticated;

-- A portal that stopped sending its heartbeat (closed tab, lost network) is
-- offline after 10 minutes, whatever it last said.
CREATE OR REPLACE FUNCTION public.presence_of(p_staff uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT CASE WHEN p.status <> 'offline' AND p.updated_at < now() - interval '10 minutes' THEN 'offline' ELSE p.status END
    FROM public.support_presence p WHERE p.staff_id = p_staff), 'offline');
$$;
REVOKE ALL ON FUNCTION public.presence_of(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Saved replies ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  tag text NOT NULL,
  body text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE IF NOT EXISTS public.saved_reply_uses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reply_id uuid NOT NULL REFERENCES public.saved_replies(id) ON DELETE CASCADE,
  staff_id uuid,
  ticket_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_reply_uses_idx ON public.saved_reply_uses (reply_id, used_at DESC);
ALTER TABLE public.saved_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reply_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_replies FROM anon, authenticated;
REVOKE ALL ON public.saved_reply_uses FROM anon, authenticated;

INSERT INTO public.saved_replies (title, tag, body, position)
SELECT v.title, v.tag, v.body, v.position
FROM (VALUES
  ('Greeting', 'General', 'Hi {first}, thanks for reaching out. I am looking into this for you now.', 1),
  ('Payment still pending', 'Payments', 'Hi {first}, your bank has confirmed the payment and we are waiting on the provider. It usually completes within 30 minutes. If it fails, you get a full refund automatically.', 2),
  ('Refund on the way', 'Refunds', 'Hi {first}, your refund of {amount} has been sent to your {bank} account. It can take up to 24 hours to show.', 3),
  ('Duplicate debit: investigating', 'Payments', 'Hi {first}, I can see what looks like a double debit. I have raised it with our payments team. You will not lose this money; we will update you within 2 hours.', 4),
  ('Palm not recognised', 'Palm', 'Hi {first}, please hold your palm flat about 5 cm above the scanner until it beeps. If it still fails, try your other enrolled palm or ask the cashier to restart the terminal.', 5),
  ('Bank linking unavailable', 'Banks', 'Hi {first}, the bank is having a temporary issue on their side. Please try again in an hour. Your other linked accounts still work.', 6),
  ('Tier 3 not available yet', 'Limits', 'Hi {first}, Tier 3 (up to ₦1,000,000 a day) is coming soon. It will need your BVN and a verified address. We will let you know when it opens.', 7),
  ('Selfie tips', 'Sign-up', 'Hi {first}, please try the selfie in good light facing a window, without glasses, a cap or a mask, and hold the phone at eye level. The camera captures by itself once your face fills the oval.', 8),
  ('Sign-up under review', 'Sign-up', 'Hi {first}, our team is checking your sign-up now. You will get an SMS within 24 hours. You do not need to start again.', 9),
  ('NIN already registered', 'Sign-up', 'Hi {first}, this NIN is already linked to a MiliPay account. If that account is not yours, reply here and we will open a fraud check and keep the account locked while we look into it.', 10),
  ('Bank account not in your name', 'Banks', 'Hi {first}, for your safety you can only link bank accounts in your own name, as it appears on your NIN. Please link an account that is in your name.', 11),
  ('Upgrade to Tier 2 with your palm', 'Limits', 'Hi {first}, to pay with your palm and raise your limits to ₦150,000 per payment and ₦500,000 a day, visit any MiliPay agent with your NIN. It takes about 5 minutes. In the app, open Palm Pay and tap Find an agent.', 12),
  ('Reset password in the app', 'Account', 'Hi {first}, you can reset it yourself: in the app open Me, then Change password, and tap "Forgot your current password?". We send a code to your phone and you can set a new one.', 13),
  ('Closing the ticket', 'General', 'Glad that is sorted, {first}. I will close this ticket now. Reply here any time if you need us again.', 14)
) AS v(title, tag, body, position)
WHERE NOT EXISTS (SELECT 1 FROM public.saved_replies);

-- ── 5. Refund requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  reference text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_pending ON public.refund_requests (transaction_id) WHERE status = 'pending';
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_requests FROM anon, authenticated;

-- ── 6. Sign-ups and fraud reports ───────────────────────────────────────
ALTER TABLE public.signup_sessions
  ADD COLUMN IF NOT EXISTS priority_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority_by uuid,
  ADD COLUMN IF NOT EXISTS priority_note text,
  ADD COLUMN IF NOT EXISTS nin_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS nin_blocked_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE SEQUENCE IF NOT EXISTS public.fraud_case_seq START 1001;
CREATE TABLE IF NOT EXISTS public.fraud_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE DEFAULT ('FR-' || nextval('public.fraud_case_seq')::text),
  signup_session_id uuid REFERENCES public.signup_sessions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  reported_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fraud_reports FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.fraud_case_seq FROM anon, authenticated;

-- ── 7. The desk ─────────────────────────────────────────────────────────
-- Where a sign-up stands, in the support panel's words and on its 5-step bar.
CREATE OR REPLACE FUNCTION public.signup_step_number(p_step text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_step WHEN 'phone' THEN 1 WHEN 'nin' THEN 2 WHEN 'selfie' THEN 3 WHEN 'confirm' THEN 3
                     WHEN 'review' THEN 3 WHEN 'addr' THEN 4 WHEN 'done' THEN 5 ELSE 1 END;
$$;

CREATE OR REPLACE FUNCTION public.support_applicant_json(s public.signup_sessions)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.id_full_name,
    'phone', s.phone,
    'step', s.step,
    'stepNumber', public.signup_step_number(s.step),
    'status', CASE WHEN s.nin_blocked_at IS NOT NULL AND s.step IN ('nin', 'abandoned') AND s.customer_id IS NULL THEN 'blocked'
                   ELSE public.signup_status(s) END,
    'reason', s.review_reason,
    'selfieFailure', s.selfie_failure,
    'attempts', s.selfie_attempts,
    'smileStatus', (SELECT r.status FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)),
    'smileConfidence', (SELECT CASE WHEN (r.payload ->> 'confidence_value') ~ '^[0-9.]+$' THEN (r.payload ->> 'confidence_value')::numeric END
                        FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)),
    'state', s.state,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'phoneVerified', s.phone_verified_at IS NOT NULL,
    'priorityAt', s.priority_at,
    'ninBlockedAt', s.nin_blocked_at,
    'blockedCustomer', (SELECT jsonb_build_object('id', c.id, 'state', c.state,
                          'registeredBy', (SELECT st.full_name FROM public.staff_profiles st WHERE st.id = c.registered_by))
                        FROM public.customers c WHERE c.id = s.nin_blocked_customer_id),
    'fraudCase', (SELECT f.case_number FROM public.fraud_reports f WHERE f.signup_session_id = s.id ORDER BY f.created_at DESC LIMIT 1),
    'customerId', s.customer_id
  );
$$;
REVOKE ALL ON FUNCTION public.support_applicant_json(public.signup_sessions) FROM PUBLIC, anon, authenticated;

-- The whole queue in one read: open tickets, the last week's solved ones,
-- the team, and who is asking.
CREATE OR REPLACE FUNCTION public.support_inbox()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'me', (SELECT jsonb_build_object('id', s.id, 'name', s.full_name, 'role', s.role, 'presence', public.presence_of(s.id))
           FROM public.staff_profiles s WHERE s.id = auth.uid()),
    'agents', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'id', s.id, 'name', s.full_name, 'role', s.role, 'presence', public.presence_of(s.id),
                  'open', (SELECT count(*) FROM public.support_tickets k WHERE k.assigned_to = s.id AND k.status <> 'resolved'))
                ORDER BY s.full_name)
              FROM public.staff_profiles s
              WHERE s.role = 'support' AND coalesce(s.status, 'active') = 'active'), '[]'::jsonb),
    'tickets', coalesce((SELECT jsonb_agg(row_to_json(t) ORDER BY t."updatedAt" DESC) FROM (
        SELECT k.id, k.ticket_id AS "ticketId",
          coalesce(nullif(trim(k.subject), ''), left(k.issue_description, 120)) AS subject,
          k.issue_description AS description, k.channel, k.urgency, k.status,
          coalesce(k.is_escalated, false) AS escalated,
          k.assigned_to AS "assignedTo", a.full_name AS "assigneeName",
          k.customer_id AS "customerId",
          coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), k.contact_name, su.id_full_name, 'Customer') AS customer,
          coalesce(c.phone, k.contact_phone, su.phone) AS phone,
          k.signup_session_id AS "signupId",
          k.created_at AS "createdAt", k.updated_at AS "updatedAt",
          k.first_replied_at AS "firstRepliedAt", k.resolved_at AS "resolvedAt",
          (SELECT count(*) FROM public.ticket_messages m
            WHERE m.ticket_id = k.id AND m.sender_type = 'customer'
              AND m.created_at > coalesce(k.staff_seen_at, '-infinity'::timestamptz)) AS unread
        FROM public.support_tickets k
        LEFT JOIN public.customers c ON c.id = k.customer_id
        LEFT JOIN public.staff_profiles a ON a.id = k.assigned_to
        LEFT JOIN public.signup_sessions su ON su.id = k.signup_session_id
        WHERE k.status <> 'resolved' OR k.resolved_at >= now() - interval '7 days'
        ORDER BY k.updated_at DESC
        LIMIT 400) t), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.support_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_inbox() TO authenticated;

-- One conversation, with the team's lines, and who wrote each.
CREATE OR REPLACE FUNCTION public.support_ticket_thread(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.sender_type, 'text', m.content, 'at', m.created_at, 'meta', m.meta,
      'senderId', m.sender_id, 'who', s.full_name) ORDER BY m.created_at, m.id)
    FROM public.ticket_messages m LEFT JOIN public.staff_profiles s ON s.id = m.sender_id
    WHERE m.ticket_id = p_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.support_ticket_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.support_mark_seen(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  UPDATE public.support_tickets SET staff_seen_at = now() WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.support_mark_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_mark_seen(uuid) TO authenticated;

-- Writes one line to a ticket's thread as the caller.
CREATE OR REPLACE FUNCTION public.support_line(p_ticket uuid, p_type text, p_text text, p_meta jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, content, meta)
  VALUES (p_ticket, auth.uid(), p_type, p_text, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.support_line(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Take it / Solve / Reopen.
CREATE OR REPLACE FUNCTION public.support_ticket_action(p_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_name text := (SELECT full_name FROM public.staff_profiles WHERE id = auth.uid());
  k public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO k FROM public.support_tickets WHERE id = p_id FOR UPDATE;
  IF k.id IS NULL THEN
    RAISE EXCEPTION 'That ticket was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'take' THEN
    IF k.status = 'resolved' THEN
      RAISE EXCEPTION 'This ticket is solved. Reopen it first.' USING ERRCODE = '22023';
    END IF;
    IF k.assigned_to = auth.uid() THEN
      RETURN jsonb_build_object('success', true);
    END IF;
    UPDATE public.support_tickets
       SET assigned_to = auth.uid(), status = 'in_progress', started_at = coalesce(started_at, now())
     WHERE id = p_id;
    -- The customer's app shows this line ("Tolu from MiliPay Support joined the chat").
    PERFORM public.support_line(p_id, CASE WHEN k.channel = 'chat' THEN 'system' ELSE 'event' END,
      CASE WHEN k.channel = 'chat' THEN split_part(coalesce(v_name, 'An agent'), ' ', 1) || ' from MiliPay Support joined the chat'
           ELSE coalesce(v_name, 'An agent') || ' took this ticket' END);

  ELSIF p_action = 'solve' THEN
    IF k.status = 'resolved' THEN
      RETURN jsonb_build_object('success', true);
    END IF;
    UPDATE public.support_tickets
       SET status = 'resolved', resolved_at = now(), solved_by = auth.uid(),
           assigned_to = coalesce(assigned_to, auth.uid())
     WHERE id = p_id;
    PERFORM public.support_line(p_id, 'system', 'Solved by ' || coalesce(v_name, 'MiliPay Support'));

  ELSIF p_action = 'reopen' THEN
    IF k.status <> 'resolved' THEN
      RETURN jsonb_build_object('success', true);
    END IF;
    UPDATE public.support_tickets
       SET status = CASE WHEN assigned_to IS NULL THEN 'open' ELSE 'in_progress' END, resolved_at = NULL, solved_by = NULL
     WHERE id = p_id;
    PERFORM public.support_line(p_id, 'system', 'Reopened by ' || coalesce(v_name, 'MiliPay Support'));

  ELSIF p_action = 'escalate' THEN
    UPDATE public.support_tickets SET is_escalated = true WHERE id = p_id;
    PERFORM public.support_line(p_id, 'event', 'Escalated to the admin team by ' || coalesce(v_name, 'staff'));

  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.support_ticket_action(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_action(uuid, text) TO authenticated;

-- The composer: a reply the customer sees, an internal note, or a logged call.
CREATE OR REPLACE FUNCTION public.support_post(p_id uuid, p_kind text, p_text text, p_meta jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_text text := trim(coalesce(p_text, ''));
  k public.support_tickets%ROWTYPE;
  v_meta jsonb;
BEGIN
  IF v_text = '' THEN
    RAISE EXCEPTION 'Write something first.' USING ERRCODE = '22023';
  END IF;
  IF length(v_text) > 4000 THEN
    RAISE EXCEPTION 'That is too long. Keep it under 4,000 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM public.support_tickets WHERE id = p_id FOR UPDATE;
  IF k.id IS NULL THEN
    RAISE EXCEPTION 'That ticket was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_kind = 'reply' THEN
    IF k.status = 'resolved' THEN
      RAISE EXCEPTION 'This ticket is solved. Reopen it to reply.' USING ERRCODE = '22023';
    END IF;
    -- Answering a ticket nobody holds makes it yours.
    IF k.assigned_to IS NULL THEN
      UPDATE public.support_tickets SET assigned_to = auth.uid(), status = 'in_progress', started_at = coalesce(started_at, now()) WHERE id = p_id;
    END IF;
    RETURN public.support_line(p_id, 'staff', v_text);
  ELSIF p_kind = 'note' THEN
    RETURN public.support_line(p_id, 'note', v_text);
  ELSIF p_kind = 'call' THEN
    v_meta := jsonb_build_object(
      'direction', CASE WHEN p_meta ->> 'direction' IN ('in', 'out', 'missed') THEN p_meta ->> 'direction' ELSE 'in' END,
      'minutes', CASE WHEN (p_meta ->> 'minutes') ~ '^\d{1,3}$' THEN (p_meta ->> 'minutes')::int END,
      'outcome', CASE WHEN p_meta ->> 'outcome' IN ('Resolved', 'Needs follow-up', 'Escalated', 'No answer', 'Missed')
                      THEN p_meta ->> 'outcome' ELSE 'Resolved' END);
    IF k.assigned_to IS NULL THEN
      UPDATE public.support_tickets SET assigned_to = auth.uid(), status = CASE WHEN status = 'resolved' THEN status ELSE 'in_progress' END,
             started_at = coalesce(started_at, now()) WHERE id = p_id;
    END IF;
    -- A call answers the customer as much as a chat reply does.
    UPDATE public.support_tickets SET first_replied_at = coalesce(first_replied_at, now())
     WHERE id = p_id AND v_meta ->> 'direction' <> 'missed' AND v_meta ->> 'outcome' NOT IN ('No answer', 'Missed');
    RETURN public.support_line(p_id, 'call', v_text, v_meta);
  END IF;
  RAISE EXCEPTION 'Unknown kind %', p_kind USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.support_post(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_post(uuid, text, text, jsonb) TO authenticated;

-- Hand over: to another support agent, with a note at the top of the thread.
CREATE OR REPLACE FUNCTION public.support_handover(p_id uuid, p_to uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_note text := trim(coalesce(p_note, ''));
  v_to record;
  k public.support_tickets%ROWTYPE;
BEGIN
  IF length(v_note) < 3 THEN
    RAISE EXCEPTION 'Write a handover note: what you tried, what is left.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM public.support_tickets WHERE id = p_id FOR UPDATE;
  IF k.id IS NULL THEN
    RAISE EXCEPTION 'That ticket was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF k.status = 'resolved' THEN
    RAISE EXCEPTION 'This ticket is solved. Reopen it first.' USING ERRCODE = '22023';
  END IF;
  SELECT id, full_name INTO v_to FROM public.staff_profiles
   WHERE id = p_to AND role = 'support' AND coalesce(status, 'active') = 'active';
  IF v_to.id IS NULL OR v_to.id = auth.uid() THEN
    RAISE EXCEPTION 'Pick another support agent.' USING ERRCODE = '22023';
  END IF;
  IF public.presence_of(v_to.id) = 'offline' THEN
    RAISE EXCEPTION '% is offline. Pick someone who is online or away.', v_to.full_name USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets SET assigned_to = v_to.id, status = 'in_progress', started_at = coalesce(started_at, now()) WHERE id = p_id;
  PERFORM public.support_line(p_id, 'note', 'Handover to ' || v_to.full_name || ': ' || left(v_note, 1000));
  PERFORM public.support_line(p_id, 'event', 'Handed over to ' || v_to.full_name);
  PERFORM public.log_audit_event('Support', 'handed over ticket', coalesce(k.ticket_id, k.id::text), k.id::text,
    jsonb_build_object('assignedTo', k.assigned_to), jsonb_build_object('assignedTo', v_to.id), v_note);
  RETURN jsonb_build_object('success', true, 'to', v_to.full_name);
END;
$$;
REVOKE ALL ON FUNCTION public.support_handover(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_handover(uuid, uuid, text) TO authenticated;

-- What a payment can be refunded from: the same states admin_resolve_transaction allows.
CREATE OR REPLACE FUNCTION public.refundable_status(p_status text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_status IN ('fulfilment_pending', 'quarantined', 'refund_failed', 'fulfilment_failed');
$$;

-- "Request refund": support cannot move money, so this asks an admin.
CREATE OR REPLACE FUNCTION public.support_request_refund(p_ticket uuid, p_reference text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_reason text := trim(coalesce(p_reason, ''));
  k public.support_tickets%ROWTYPE;
  t public.transactions%ROWTYPE;
  v_id uuid;
BEGIN
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give a reason, and what the customer told you.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM public.support_tickets WHERE id = p_ticket;
  IF k.id IS NULL OR k.customer_id IS NULL THEN
    RAISE EXCEPTION 'That ticket has no customer to refund.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.transactions WHERE reference = p_reference AND customer_id = k.customer_id;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'That payment is not one of this customer''s.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.refundable_status(t.status) THEN
    RAISE EXCEPTION 'That payment can''t be refunded: it is %.', replace(t.status, '_', ' ') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_requests r WHERE r.transaction_id = t.id AND r.status = 'pending') THEN
    RAISE EXCEPTION 'A refund for this payment is already waiting for an admin.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.refund_requests (ticket_id, transaction_id, reference, amount, reason, requested_by)
  VALUES (k.id, t.id, t.reference, t.amount, left(v_reason, 1000), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.support_line(k.id, 'event',
    'Refund requested: ₦' || to_char(t.amount, 'FM999,999,999,990') || ' for ' || t.reference || ' · waiting for admin',
    jsonb_build_object('refundRequest', v_id));
  PERFORM public.support_line(k.id, 'note', 'Refund request reason: ' || left(v_reason, 1000));
  PERFORM public.log_audit_event('Support', 'requested refund', t.reference, t.id::text,
    jsonb_build_object('status', t.status), jsonb_build_object('refundRequest', 'pending'), v_reason);
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.support_request_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_request_refund(uuid, text, text) TO authenticated;

-- A ticket for a call or email that came in outside the app.
CREATE OR REPLACE FUNCTION public.support_create_ticket(
  p_customer_id uuid,
  p_signup_id uuid,
  p_channel text,
  p_subject text,
  p_urgency text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_subject text := left(trim(coalesce(p_subject, '')), 160);
  v_note text := left(trim(coalesce(p_note, '')), 4000);
  v_su public.signup_sessions%ROWTYPE;
  v_c public.customers%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_channel NOT IN ('call', 'email', 'walk_in') THEN
    RAISE EXCEPTION 'Pick call or email.' USING ERRCODE = '22023';
  END IF;
  IF p_urgency NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Pick an urgency.' USING ERRCODE = '22023';
  END IF;
  IF length(v_subject) < 3 THEN
    RAISE EXCEPTION 'Give the ticket a subject.' USING ERRCODE = '22023';
  END IF;
  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_c FROM public.customers WHERE id = p_customer_id;
    IF v_c.id IS NULL THEN
      RAISE EXCEPTION 'That customer was not found.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_signup_id IS NOT NULL THEN
    SELECT * INTO v_su FROM public.signup_sessions WHERE id = p_signup_id;
    IF v_su.id IS NULL THEN
      RAISE EXCEPTION 'That sign-up was not found.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'Pick who the ticket is about.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_tickets
    (customer_id, signup_session_id, contact_name, contact_phone, issue_description, subject, channel, urgency,
     status, assigned_to, created_by, started_at)
  VALUES
    (v_c.id, v_su.id, v_su.id_full_name, coalesce(v_c.phone, v_su.phone), coalesce(nullif(v_note, ''), v_subject), v_subject,
     p_channel, p_urgency, 'in_progress', auth.uid(), auth.uid(), now())
  RETURNING id INTO v_id;
  IF v_note <> '' THEN
    PERFORM public.support_line(v_id, 'note', v_note);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.support_create_ticket(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_create_ticket(uuid, uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.support_set_presence(p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  IF p_status NOT IN ('online', 'away', 'offline') THEN
    RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.support_presence (staff_id, status, updated_at) VALUES (auth.uid(), p_status, now())
  ON CONFLICT (staff_id) DO UPDATE SET status = excluded.status, updated_at = now();
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION public.support_set_presence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_set_presence(text) TO authenticated;

-- Find a customer by phone, name, last 4 of NIN, a payment reference or a
-- ticket number; people still signing up are found by phone or name. With
-- nothing typed: the people who contacted support most recently.
CREATE OR REPLACE FUNCTION public.support_people(p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_ref text := upper(regexp_replace(coalesce(p_q, ''), '[^0-9A-Za-z]', '', 'g'));
BEGIN
  IF v_digits LIKE '234%' AND length(v_digits) > 6 THEN
    v_digits := '0' || substr(v_digits, 4);
  END IF;

  RETURN coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p."lastContact" DESC NULLS LAST, p.name) FROM (
    WITH hits AS (
      -- customers by name, phone or NIN
      SELECT c.id AS cid, NULL::uuid AS sid, NULL::text AS match
      FROM public.customers c
      WHERE v_q <> '' AND (
        (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ILIKE v_like
        OR (length(v_digits) >= 4 AND regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%')
        OR (v_digits ~ '^\d{4}$' AND c.nin_last_4 = v_digits))
      UNION
      -- a payment reference
      SELECT t.customer_id, NULL, ' · paid ' || coalesce(t.merchant_name, 'MiliPay') || ' (' || t.reference || ')'
      FROM public.transactions t
      WHERE length(v_ref) >= 5 AND t.customer_id IS NOT NULL
        AND upper(regexp_replace(t.reference, '[^0-9A-Za-z]', '', 'g')) LIKE '%' || v_ref || '%'
      UNION
      -- a ticket number
      SELECT k.customer_id, k.signup_session_id, ' · ticket ' || k.ticket_id
      FROM public.support_tickets k
      WHERE length(v_ref) >= 4 AND upper(regexp_replace(coalesce(k.ticket_id, ''), '[^0-9A-Za-z]', '', 'g')) LIKE '%' || v_ref || '%'
        AND (k.customer_id IS NOT NULL OR k.signup_session_id IS NOT NULL)
      UNION
      -- people still signing up
      SELECT NULL, s.id, NULL
      FROM public.signup_sessions s
      WHERE v_q <> '' AND s.customer_id IS NULL AND (
        coalesce(s.id_full_name, '') ILIKE v_like
        OR (length(v_digits) >= 4 AND regexp_replace(s.phone, '\D', '', 'g') LIKE '%' || v_digits || '%'))
      UNION
      -- nothing typed: who has been in touch
      SELECT k.customer_id, k.signup_session_id, NULL
      FROM public.support_tickets k
      WHERE v_q = '' AND (k.customer_id IS NOT NULL OR k.signup_session_id IS NOT NULL)
    ),
    people AS (
      SELECT DISTINCT ON (coalesce(h.cid, h.sid)) h.cid, h.sid, h.match
      FROM hits h WHERE coalesce(h.cid, h.sid) IS NOT NULL
      ORDER BY coalesce(h.cid, h.sid), h.match NULLS LAST
    )
    SELECT
      CASE WHEN p.cid IS NOT NULL THEN 'customer' ELSE 'applicant' END AS kind,
      coalesce(p.cid, p.sid) AS id,
      coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), s.id_full_name, 'Signing up') AS name,
      coalesce(c.phone, s.phone) AS phone,
      c.kyc_tier AS tier,
      coalesce(c.has_palm_template, false) AS palm,
      c.status,
      CASE WHEN s.id IS NOT NULL THEN public.signup_step_number(s.step) END AS "signupStep",
      p.match,
      (SELECT count(*) FROM public.support_tickets k
        WHERE k.status <> 'resolved' AND (k.customer_id = p.cid OR k.signup_session_id = p.sid)) AS "openTickets",
      (SELECT max(k.updated_at) FROM public.support_tickets k
        WHERE k.customer_id = p.cid OR k.signup_session_id = p.sid) AS "lastContact"
    FROM people p
    LEFT JOIN public.customers c ON c.id = p.cid
    LEFT JOIN public.signup_sessions s ON s.id = p.sid
    LIMIT 50
  ) p), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.support_people(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_people(text) TO authenticated;

-- Someone still signing up, for the customer panel and their page.
CREATE OR REPLACE FUNCTION public.support_applicant(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  s public.signup_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.signup_sessions WHERE id = p_id;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.support_applicant_json(s) || jsonb_build_object(
    'tickets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'ticketId', k.ticket_id, 'channel', k.channel,
                 'subject', coalesce(k.subject, k.issue_description), 'status', k.status, 'createdAt', k.created_at, 'updatedAt', k.updated_at)
                 ORDER BY k.created_at DESC)
               FROM public.support_tickets k WHERE k.signup_session_id = s.id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.support_applicant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_applicant(uuid) TO authenticated;

-- A customer's payments as support sees them: what happened, from which
-- bank, whether it can be refunded, and what they spent today.
CREATE OR REPLACE FUNCTION public.support_customer_payments(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  RETURN jsonb_build_object(
    'spentToday', (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t
                   WHERE t.customer_id = p_id AND t.created_at >= public.lagos_today()
                     AND t.status NOT IN ('payment_failed', 'refunded')),
    'payments', coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT t.id, t.reference, t.amount, t.status, t.created_at AS "createdAt",
        (t.merchant_id IS NOT NULL OR t.terminal_id IS NOT NULL) AS palm,
        t.service_type AS "serviceType", t.provider, t.merchant_name AS "merchantName",
        t.failure_reason AS "failureReason",
        a.bank_name AS bank, right(a.account_number, 4) AS "bankLast4",
        public.refundable_status(t.status) AS refundable,
        EXISTS (SELECT 1 FROM public.refund_requests r WHERE r.transaction_id = t.id AND r.status = 'pending') AS "refundRequested"
      FROM public.transactions t LEFT JOIN public.linked_accounts a ON a.id = t.account_used
      WHERE t.customer_id = p_id
      ORDER BY t.created_at DESC LIMIT 30) x), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.support_customer_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_customer_payments(uuid) TO authenticated;

-- The support dashboard's numbers that aren't in the queue itself, and any
-- provider that is slow right now (the banner).
CREATE OR REPLACE FUNCTION public.support_today()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
  v_today timestamptz := public.lagos_today();
BEGIN
  RETURN jsonb_build_object(
    'solvedToday', (SELECT count(*) FROM public.support_tickets WHERE resolved_at >= v_today),
    'solvedTodayMine', (SELECT count(*) FROM public.support_tickets WHERE resolved_at >= v_today AND solved_by = auth.uid()),
    'solvers', (SELECT count(DISTINCT solved_by) FROM public.support_tickets WHERE resolved_at >= v_today AND solved_by IS NOT NULL),
    'firstReplySeconds', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_replied_at - created_at))
                          FROM public.support_tickets WHERE first_replied_at IS NOT NULL AND created_at >= now() - interval '7 days'),
    'firstReplyCount', (SELECT count(*) FROM public.support_tickets WHERE first_replied_at IS NOT NULL AND created_at >= now() - interval '7 days'),
    'slow', coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x."oldestMinutes" DESC) FROM (
        SELECT coalesce(t.provider, t.merchant_name, 'A provider') AS provider, t.service_type AS service,
          count(*) AS pending,
          round(extract(epoch FROM now() - min(coalesce(t.paid_at, t.created_at))) / 60) AS "oldestMinutes"
        FROM public.transactions t
        WHERE t.status IN ('fulfilment_pending', 'fulfilling') AND t.created_at >= now() - interval '6 hours'
        GROUP BY 1, 2
        HAVING count(*) >= 3 OR min(coalesce(t.paid_at, t.created_at)) < now() - interval '15 minutes') x), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.support_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_today() TO authenticated;

-- Every logged call, newest first.
CREATE OR REPLACE FUNCTION public.support_calls(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x)) FROM (
    SELECT m.id, m.created_at AS at, m.content AS summary, m.meta ->> 'direction' AS direction,
      (m.meta ->> 'minutes')::int AS minutes, m.meta ->> 'outcome' AS outcome,
      k.id AS "ticketUuid", k.ticket_id AS "ticketId",
      coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), k.contact_name, 'Customer') AS customer,
      s.full_name AS agent
    FROM public.ticket_messages m
    JOIN public.support_tickets k ON k.id = m.ticket_id
    LEFT JOIN public.customers c ON c.id = k.customer_id
    LEFT JOIN public.staff_profiles s ON s.id = m.sender_id
    WHERE m.sender_type = 'call'
    ORDER BY m.created_at DESC
    LIMIT least(greatest(p_limit, 1), 500)) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.support_calls(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_calls(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.support_saved_replies()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'tag', r.tag, 'body', r.body,
      'uses', (SELECT count(*) FROM public.saved_reply_uses u WHERE u.reply_id = r.id AND u.used_at >= now() - interval '7 days'))
      ORDER BY r.position, r.title)
    FROM public.saved_replies r WHERE r.active), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.support_saved_replies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_saved_replies() TO authenticated;

CREATE OR REPLACE FUNCTION public.support_use_reply(p_id uuid, p_ticket uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['support', 'admin', 'super_admin']);
BEGIN
  INSERT INTO public.saved_reply_uses (reply_id, staff_id, ticket_id)
  SELECT r.id, auth.uid(), p_ticket FROM public.saved_replies r WHERE r.id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.support_use_reply(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_use_reply(uuid, uuid) TO authenticated;

-- ── Admins: refund requests from support (Operations) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_refund_requests()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x.pending DESC, x."requestedAt" DESC) FROM (
    SELECT r.id, r.reference, r.amount, r.reason, r.status, r.status = 'pending' AS pending,
      r.requested_at AS "requestedAt", r.decided_at AS "decidedAt", r.decision_note AS "decisionNote",
      rq.full_name AS "requestedBy", dc.full_name AS "decidedBy",
      t.status AS "txStatus", t.merchant_name AS "merchantName", t.service_type AS "serviceType",
      k.id AS "ticketUuid", k.ticket_id AS "ticketId",
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS customer
    FROM public.refund_requests r
    JOIN public.transactions t ON t.id = r.transaction_id
    LEFT JOIN public.support_tickets k ON k.id = r.ticket_id
    LEFT JOIN public.customers c ON c.id = t.customer_id
    LEFT JOIN public.staff_profiles rq ON rq.id = r.requested_by
    LEFT JOIN public.staff_profiles dc ON dc.id = r.decided_by
    WHERE r.status = 'pending' OR r.decided_at >= now() - interval '7 days'
    LIMIT 100) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_refund_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_requests() TO authenticated;

-- Approving runs the refund through admin_resolve_transaction (which checks
-- the state machine and writes its own audit row); declining is audited here.
CREATE OR REPLACE FUNCTION public.admin_decide_refund_request(p_id uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_note text := trim(coalesce(p_note, ''));
  v_name text;
  r public.refund_requests%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  IF length(v_note) < 3 THEN
    RAISE EXCEPTION 'Give a reason. It goes on the audit trail.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.refund_requests WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'That request was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'That request was already decided.' USING ERRCODE = '22023';
  END IF;
  SELECT full_name INTO v_name FROM public.staff_profiles WHERE id = auth.uid();

  IF p_approve THEN
    PERFORM public.admin_resolve_transaction(r.reference, 'refund', 'Support request: ' || v_note);
  ELSE
    PERFORM public.log_audit_event('Transactions', 'declined refund request', r.reference, r.transaction_id::text,
      jsonb_build_object('refundRequest', 'pending'), jsonb_build_object('refundRequest', 'declined'), v_note);
  END IF;
  UPDATE public.refund_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
         decided_by = auth.uid(), decided_at = now(), decision_note = left(v_note, 1000)
   WHERE id = r.id;
  IF r.ticket_id IS NOT NULL THEN
    INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, content, meta)
    VALUES (r.ticket_id, auth.uid(), 'event',
      CASE WHEN p_approve THEN 'Refund approved by ' || coalesce(v_name, 'an admin') || ': ' || r.reference
           ELSE 'Refund request declined by ' || coalesce(v_name, 'an admin') || ': ' || left(v_note, 300) END,
      jsonb_build_object('refundRequest', r.id));
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_decide_refund_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_refund_request(uuid, boolean, text) TO authenticated;

-- ── Admins: support's requests on Sign-ups and fraud reports on a customer ─
-- Unchanged from 20261003110000 apart from: Sign-ups lists a review support
-- asked to prioritise first, the review drawer shows that request, a NIN
-- that was refused and any fraud report; a customer's profile lists the
-- fraud reports about it.

CREATE OR REPLACE FUNCTION public.staff_customer_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.assert_staff(ARRAY['admin', 'super_admin', 'support', 'agent']);
  c public.customers%ROWTYPE;
  v_out jsonb;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_id;
  IF c.id IS NULL OR (v_role = 'agent' AND c.registered_by IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'name', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
    'firstName', c.first_name,
    'lastName', c.last_name,
    'phone', c.phone,
    'email', c.email,
    'address', c.address,
    'landmark', c.address_landmark,
    'state', c.state,
    'lga', c.lga,
    'ninLast4', c.nin_last_4,
    'bvnLast4', c.bvn_last_4,
    'ninVerified', c.nin_verified,
    'bvnVerified', c.bvn_verified,
    'dob', c.date_of_birth,
    'gender', c.gender,
    'status', c.status,
    'tier', c.kyc_tier,
    'source', c.signup_source,
    'hasPalm', c.has_palm_template,
    'hasFace', c.has_face_template,
    'palmSimulated', c.palm_simulated,
    'faceSimulated', c.face_simulated,
    'selfieVerifiedAt', c.selfie_verified_at,
    'palmPaused', c.palm_paused,
    'pinThreshold', c.pin_threshold,
    'singleLimit', c.single_limit,
    'dailyLimit', c.daily_limit,
    'rejectionReason', c.rejection_reason,
    'createdAt', c.created_at,
    'verifiedAt', c.verified_at,
    'passwordChangedAt', c.password_changed_at,
    'biometricEnrolledAt', c.biometric_enrolled_at,
    'onboardingCompletedAt', c.onboarding_completed_at,
    'hasLogin', c.auth_user_id IS NOT NULL,
    'tierCaps', (SELECT jsonb_build_object('maxSingle', max_single, 'maxDaily', max_daily) FROM public.tier_caps(coalesce(c.kyc_tier, 2))),
    'registeredBy', (SELECT jsonb_build_object('name', s.full_name, 'state', s.state, 'role', s.role)
                     FROM public.staff_profiles s WHERE s.id = c.registered_by),
    'verifiedBy', (SELECT s.full_name FROM public.staff_profiles s WHERE s.id = c.verified_by),
    'palm', (SELECT jsonb_build_object('captures', count(*), 'quality', round(avg(quality_score)))
             FROM public.palm_templates p WHERE p.customer_id = c.id AND p.retired_at IS NULL),
    'accounts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'bank', a.bank_name, 'last4', right(a.account_number, 4),
                           'palmDefault', a.id = c.palm_account_id) ORDER BY a.created_at)
                          FROM public.linked_accounts a WHERE a.user_id = c.auth_user_id AND a.is_active), '[]'::jsonb),
    'signup', (SELECT jsonb_build_object('id', s.id, 'decision', s.decision, 'phoneVerifiedAt', s.phone_verified_at, 'createdAt', s.created_at,
                 'smileStatus', (SELECT r.status FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)))
               FROM public.signup_sessions s WHERE s.customer_id = c.id ORDER BY s.created_at DESC LIMIT 1),
    'security', jsonb_build_object(
      'passwordResetAt', (SELECT max(used_at) FROM public.password_resets r WHERE r.customer_id = c.id),
      'contactChanges', coalesce((SELECT jsonb_agg(jsonb_build_object('email', x.new_email IS NOT NULL, 'phone', x.new_phone IS NOT NULL, 'at', x.applied_at) ORDER BY x.applied_at DESC)
                                  FROM public.contact_change_requests x WHERE x.customer_id = c.id AND x.applied_at IS NOT NULL), '[]'::jsonb),
      'lastCodeSignIn', (SELECT max(consumed_at) FROM public.login_codes l WHERE l.customer_id = c.id),
      'devices', coalesce((SELECT jsonb_agg(jsonb_build_object('name', d.device_name, 'platform', d.platform, 'lastSeen', d.last_seen_at) ORDER BY d.last_seen_at DESC NULLS LAST)
                           FROM public.push_tokens d WHERE d.customer_id = c.id AND d.revoked_at IS NULL), '[]'::jsonb)
    ),
    'tickets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'ticketId', k.ticket_id, 'subject', coalesce(k.subject, k.issue_description),
                          'status', k.status, 'createdAt', k.created_at) ORDER BY k.created_at DESC)
                         FROM public.support_tickets k WHERE k.customer_id = c.id), '[]'::jsonb),
    'fraudReports', coalesce((SELECT jsonb_agg(jsonb_build_object('caseNumber', f.case_number, 'status', f.status, 'note', f.note, 'createdAt', f.created_at) ORDER BY f.created_at DESC)
                              FROM public.fraud_reports f WHERE f.customer_id = c.id), '[]'::jsonb),
    'mismatches', coalesce((SELECT jsonb_agg(jsonb_build_object('bank', m.bank_name, 'accountName', m.account_name, 'createdAt', m.created_at) ORDER BY m.created_at DESC)
                            FROM public.bank_name_mismatches m WHERE m.customer_id = c.id), '[]'::jsonb),
    'audit', CASE WHEN v_role IN ('admin', 'super_admin') THEN coalesce((SELECT jsonb_agg(row_to_json(a)) FROM (
                SELECT actor_name AS "actorName", action, reason, occurred_at AS "at"
                FROM public.audit_events WHERE target_id = c.id::text ORDER BY id DESC LIMIT 10) a), '[]'::jsonb)
             ELSE '[]'::jsonb END,
    'txCount', (SELECT count(*) FROM public.transactions t WHERE t.customer_id = c.id),
    'txTotal', (SELECT coalesce(sum(amount), 0) FROM public.transactions t WHERE t.customer_id = c.id AND t.status = 'delivered'),
    'txs', coalesce((SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT id, reference, amount, status, created_at AS "createdAt", (merchant_id IS NOT NULL OR terminal_id IS NOT NULL) AS palm,
          service_type AS "serviceType", provider, merchant_name AS "merchantName"
        FROM public.transactions WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 6) t), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_customer_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_customer_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_signups(p_range text DEFAULT 'today', p_tab text DEFAULT 'review', p_q text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_q text := left(trim(coalesce(p_q, '')), 80);
  v_like text := '%' || replace(replace(replace(left(trim(coalesce(p_q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  v_start := CASE p_range
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
  END;

  WITH all_s AS (
    SELECT s.*, public.signup_status(s) AS st,
      (SELECT r.status FROM public.smile_results r WHERE r.job_id = coalesce(s.evaluated_job_id, s.smile_job_id)) AS smile_status,
      c.onboarding_completed_at
    FROM public.signup_sessions s LEFT JOIN public.customers c ON c.id = s.customer_id
  ),
  ranged AS (SELECT * FROM all_s WHERE created_at >= v_start),
  listed AS (
    SELECT * FROM all_s
    WHERE (p_tab = st OR (p_tab = 'completed' AND st = 'approved') OR (p_tab = 'rejected' AND st = 'agent'))
      AND (v_q = '' OR coalesce(id_full_name, '') ILIKE v_like
           OR (length(v_digits) >= 4 AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_digits || '%'))
  )
  SELECT jsonb_build_object(
    'funnel', (SELECT jsonb_build_array(
        count(*),
        count(*) FILTER (WHERE phone_verified_at IS NOT NULL),
        count(*) FILTER (WHERE nin IS NOT NULL),
        count(*) FILTER (WHERE id_full_name IS NOT NULL),
        count(*) FILTER (WHERE customer_id IS NOT NULL),
        count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)) FROM ranged),
    'counts', (SELECT jsonb_build_object(
        'review', count(*) FILTER (WHERE st = 'review'),
        'in_progress', count(*) FILTER (WHERE st = 'in_progress'),
        'abandoned', count(*) FILTER (WHERE st = 'abandoned'),
        'completed', count(*) FILTER (WHERE st IN ('completed', 'approved')),
        'rejected', count(*) FILTER (WHERE st IN ('rejected', 'agent'))) FROM all_s),
    'mismatches', coalesce((SELECT jsonb_agg(row_to_json(m)) FROM (
        SELECT x.id, x.customer_id AS "customerId", coalesce(x.customer_name, trim(c.first_name || ' ' || c.last_name)) AS customer,
          x.bank_name AS bank, x.account_name AS "accountName", x.created_at AS "createdAt"
        FROM public.bank_name_mismatches x LEFT JOIN public.customers c ON c.id = x.customer_id
        WHERE x.created_at >= now() - interval '30 days'
        ORDER BY x.created_at DESC LIMIT 6) m), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, phone, id_full_name AS name, step, st AS status, selfie_attempts AS attempts, smile_status AS "smileStatus",
          review_reason AS reason, created_at AS "createdAt", updated_at AS "updatedAt", customer_id AS "customerId",
          priority_at AS "priorityAt"
        FROM listed ORDER BY (priority_at IS NOT NULL AND st = 'review') DESC, updated_at DESC LIMIT 200) r), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signups(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signups(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_signup_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.signup_sessions%ROWTYPE;
  v_payload jsonb;
  v_smile_status text;
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO s FROM public.signup_sessions WHERE id = p_id;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT r.payload, r.status INTO v_payload, v_smile_status
  FROM public.smile_results r WHERE r.job_id = coalesce(s.smile_job_id, s.evaluated_job_id);

  SELECT jsonb_build_object(
    'id', s.id,
    'phone', s.phone,
    'name', s.id_full_name,
    'step', s.step,
    'status', public.signup_status(s),
    'decision', s.decision,
    'reason', s.review_reason,
    'attempts', s.selfie_attempts,
    'selfieFailure', s.selfie_failure,
    'ninLast4', right(s.nin, 4),
    'dob', s.date_of_birth,
    'state', s.state,
    'lga', s.lga,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'phoneVerifiedAt', s.phone_verified_at,
    'consentAt', s.consent_at,
    'confirmedAt', s.confirmed_at,
    'reviewedAt', s.reviewed_at,
    'reviewedBy', (SELECT full_name FROM public.staff_profiles WHERE id = s.reviewed_by),
    'remindedAt', s.reminded_at,
    'customerId', s.customer_id,
    'priority', CASE WHEN s.priority_at IS NULL THEN NULL ELSE jsonb_build_object('at', s.priority_at, 'note', s.priority_note,
                   'by', (SELECT full_name FROM public.staff_profiles WHERE id = s.priority_by)) END,
    'ninBlockedAt', s.nin_blocked_at,
    'fraudReports', coalesce((SELECT jsonb_agg(jsonb_build_object('caseNumber', f.case_number, 'status', f.status, 'note', f.note, 'createdAt', f.created_at,
                       'customerId', f.customer_id, 'by', (SELECT full_name FROM public.staff_profiles WHERE id = f.reported_by)) ORDER BY f.created_at DESC)
                     FROM public.fraud_reports f WHERE f.signup_session_id = s.id), '[]'::jsonb),
    'smile', CASE WHEN v_payload IS NULL THEN NULL ELSE jsonb_build_object(
      'jobId', coalesce(s.smile_job_id, s.evaluated_job_id),
      'status', v_smile_status,
      'reason', v_payload ->> 'reason',
      'risk', v_payload #>> '{antifraud,fraud_risk,risk_level}',
      'confidence', CASE WHEN (v_payload ->> 'confidence_value') ~ '^[0-9.]+$' THEN (v_payload ->> 'confidence_value')::numeric END,
      'selfieUrl', v_payload #>> '{image_links,selfie_image}',
      'photoUrl', v_payload #>> '{id_fields,photo_url}',
      'nimcName', v_payload #>> '{id_fields,full_name}',
      'ninMatches', (v_payload #>> '{id_fields,id_number}') = s.nin,
      'dobMatches', (v_payload #>> '{id_fields,date_of_birth}') = s.date_of_birth::text
    ) END
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signup_detail(uuid) TO authenticated;
