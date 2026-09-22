-- Ticket IDs were four random digits.
--
--     const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
--
-- That is 9,000 possible values, generated in the browser, against a UNIQUE
-- index on support_tickets.ticket_id. A collision therefore does not create a
-- duplicate — it fails the insert, and nothing retries, so the agent simply
-- sees the ticket fail to open.
--
-- The probability compounds with every ticket that already exists: around 1%
-- per new ticket at a hundred tickets, 11% at a thousand, a coin toss at four
-- and a half thousand, and at nine thousand tickets no new ticket can ever be
-- created again.
--
-- A sequence is the right owner of this. It is short, it is ordered, and the
-- database — which is what enforces the uniqueness — is what assigns it.

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq AS bigint START WITH 1000 INCREMENT BY 1;

-- Start ahead of anything already issued so existing tickets keep their IDs.
SELECT setval(
  'public.support_ticket_seq',
  GREATEST(
    1000,
    COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(ticket_id, '\D', '', 'g'), ''))::bigint
       FROM public.support_tickets
       WHERE ticket_id ~ '^TKT-\d+$'),
      999
    ) + 1
  ),
  false
);

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_id
  SET DEFAULT 'TKT-' || lpad(nextval('public.support_ticket_seq')::text, 5, '0');

-- The sequence is only ever advanced through the default above, by whoever is
-- allowed to insert a ticket.
GRANT USAGE ON SEQUENCE public.support_ticket_seq TO authenticated, service_role;

COMMENT ON SEQUENCE public.support_ticket_seq IS
  'Assigns support_tickets.ticket_id. Replaced a 4-digit browser-side random, which exhausted at 9,000 tickets and failed inserts long before that.';
