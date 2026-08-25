-- Create the ticket_messages table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- the user or staff member sending the message
    sender_type text NOT NULL CHECK (sender_type IN ('customer', 'staff', 'system')),
    content text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for efficient querying by ticket
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id_idx ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_messages_created_at_idx ON public.ticket_messages(created_at);

-- RLS Policies
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Admins and Support staff can view all messages
CREATE POLICY "Admins and Support can view all messages" 
    ON public.ticket_messages 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support')
        )
    );

-- Admins and Support can insert messages
CREATE POLICY "Admins and Support can insert messages" 
    ON public.ticket_messages 
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support')
        )
    );
