-- Support chat (redesign phase 5): what a customer may do to a ticket.
--
-- 1. "Customers can update own tickets" let a customer change EVERY column
--    of their ticket, with no WITH CHECK: mark it solved or escalated, assign
--    it to any staff member, set its urgency, or move it onto another
--    customer's account. The app only ever did it to bump updated_at (so the
--    staff queue shows the latest chat first) and to reopen a solved ticket.
--    The policy is gone. updated_at is bumped by the database when a message
--    arrives, and a solved chat stays closed (the design: "This ticket has
--    been solved. Chat is closed." — start a new chat instead).
--
-- 2. A customer could create a ticket already "resolved", "in_progress",
--    escalated or assigned to someone. A new ticket from a customer is now an
--    open, unassigned, unescalated one of their own.
--
-- 3. A customer could keep writing into a solved ticket. They can't now.
--
-- Staff policies are untouched.

DROP POLICY IF EXISTS "Customers can update own tickets" ON public.support_tickets;

DROP POLICY IF EXISTS "Customers can create tickets" ON public.support_tickets;
CREATE POLICY "Customers can create tickets"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (customer_id IS NULL OR customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()))
    AND status = 'open'
    AND assigned_to IS NULL
    AND coalesce(is_escalated, false) = false
    AND solved_by IS NULL
    AND resolved_at IS NULL
  );

DROP POLICY IF EXISTS "Customers can insert own messages" ON public.ticket_messages;
CREATE POLICY "Customers can insert own messages"
  ON public.ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_type = 'customer'
    AND ticket_id IN (
      SELECT support_tickets.id FROM public.support_tickets
       WHERE (support_tickets.created_by = auth.uid()
              OR support_tickets.customer_id IN (SELECT customers.id FROM public.customers WHERE customers.auth_user_id = auth.uid()))
         AND support_tickets.status <> 'resolved'
    )
  );

-- Every message moves its ticket to the top of the staff queue.
CREATE OR REPLACE FUNCTION public.touch_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[touch_ticket_on_message] %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_ticket_on_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ticket_messages_touch_ticket ON public.ticket_messages;
CREATE TRIGGER ticket_messages_touch_ticket
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_on_message();
