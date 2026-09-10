-- Migration: 20260910000005_fix_support_tickets_assigned_to_fkey_and_rls.sql
-- Description: Point assigned_to constraint to staff_profiles and grant comprehensive staff & customer RLS permissions for Help & Support workflow.

-- 1. Ensure support_tickets.assigned_to references public.staff_profiles(id)
ALTER TABLE public.support_tickets 
  DROP CONSTRAINT IF EXISTS support_tickets_assigned_to_fkey;

ALTER TABLE public.support_tickets 
  ADD CONSTRAINT support_tickets_assigned_to_fkey 
  FOREIGN KEY (assigned_to) REFERENCES public.staff_profiles(id) ON DELETE SET NULL;

-- 2. Staff Management Policy on support_tickets (Claim, Attend, Solve, Escalate)
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles 
      WHERE staff_profiles.id = auth.uid() 
      AND staff_profiles.role IN ('admin', 'super_admin', 'support', 'agent')
    )
  );

-- 3. Customer Policies on support_tickets (Supports both auth.users.id and customers.auth_user_id)
DROP POLICY IF EXISTS "Customers can view own tickets" ON public.support_tickets;
CREATE POLICY "Customers can view own tickets" 
  ON public.support_tickets 
  FOR SELECT 
  USING (
    created_by = auth.uid() 
    OR customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Customers can update own tickets" ON public.support_tickets;
CREATE POLICY "Customers can update own tickets" 
  ON public.support_tickets 
  FOR UPDATE 
  USING (
    created_by = auth.uid() 
    OR customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid())
  );

-- 4. Staff Message Policy on ticket_messages (Allows both 'staff' replies and 'system' events)
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
    AND (sender_id = auth.uid() OR sender_id IS NULL)
    AND sender_type IN ('staff', 'system')
  );

-- 5. Customer Message Policies on ticket_messages
DROP POLICY IF EXISTS "Customers can view own messages" ON public.ticket_messages;
CREATE POLICY "Customers can view own messages" 
  ON public.ticket_messages 
  FOR SELECT 
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets 
      WHERE created_by = auth.uid() 
      OR customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers can insert own messages" ON public.ticket_messages;
CREATE POLICY "Customers can insert own messages" 
  ON public.ticket_messages 
  FOR INSERT 
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.support_tickets 
      WHERE created_by = auth.uid() 
      OR customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid())
    )
    AND sender_id = auth.uid()
    AND sender_type = 'customer'
  );
