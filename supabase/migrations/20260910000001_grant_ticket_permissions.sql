-- Grant base table access to the authenticated and service roles
-- (Row Level Security policies will continue to filter what they can actually see/do)

GRANT ALL ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

GRANT ALL ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
