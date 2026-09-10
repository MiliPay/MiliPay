-- Update ticket RLS to allow agent role
DROP POLICY IF EXISTS "Admins and Support can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins and Support can view all tickets" 
    ON public.support_tickets 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support', 'agent')
        )
    );

DROP POLICY IF EXISTS "Admins and Support can manage tickets" ON public.support_tickets;
CREATE POLICY "Admins and Support can manage tickets" 
    ON public.support_tickets 
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support', 'agent')
        )
    );

DROP POLICY IF EXISTS "Admins and Support can view all messages" ON public.ticket_messages;
CREATE POLICY "Admins and Support can view all messages" 
    ON public.ticket_messages 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support', 'agent')
        )
    );

DROP POLICY IF EXISTS "Admins and Support can insert messages" ON public.ticket_messages;
CREATE POLICY "Admins and Support can insert messages" 
    ON public.ticket_messages 
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support', 'agent')
        )
        AND sender_id = auth.uid()
        AND sender_type = 'staff'
    );
