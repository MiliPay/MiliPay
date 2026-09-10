-- 1. Make ticket_id nullable so chats can start informally without a formal ticket number
ALTER TABLE public.support_tickets ALTER COLUMN ticket_id DROP NOT NULL;

-- 2. Add an escalated flag to cleanly track escalations to admin
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS is_escalated boolean DEFAULT false;

-- 3. Update the RLS for support_tickets so CUSTOMERS can use it
-- Customer can view their own tickets
CREATE POLICY "Customers can view own tickets" 
    ON public.support_tickets 
    FOR SELECT 
    USING (created_by = auth.uid());

-- Customer can create a chat session (ticket)
CREATE POLICY "Customers can create tickets" 
    ON public.support_tickets 
    FOR INSERT 
    WITH CHECK (created_by = auth.uid());

-- Customer can update their own ticket (e.g., closing it)
CREATE POLICY "Customers can update own tickets" 
    ON public.support_tickets 
    FOR UPDATE 
    USING (created_by = auth.uid());

-- 4. Update the RLS for ticket_messages so CUSTOMERS can chat
-- Customer can view messages in their own tickets
CREATE POLICY "Customers can view own messages" 
    ON public.ticket_messages 
    FOR SELECT 
    USING (
        ticket_id IN (
            SELECT id FROM public.support_tickets 
            WHERE created_by = auth.uid()
        )
    );

-- Customer can insert messages in their own tickets
CREATE POLICY "Customers can insert own messages" 
    ON public.ticket_messages 
    FOR INSERT 
    WITH CHECK (
        ticket_id IN (
            SELECT id FROM public.support_tickets 
            WHERE created_by = auth.uid()
        )
        AND sender_id = auth.uid()
        AND sender_type = 'customer'
    );

-- 5. Enable Supabase Realtime for these tables to allow live chat
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
    END IF;
END
$$;
