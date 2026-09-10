-- Allow staff members to view linked_accounts, users, and transactions

CREATE POLICY "Staff can view all users" 
  ON public.users 
  FOR SELECT 
  USING (
    EXISTS (
        SELECT 1 FROM public.staff_profiles 
        WHERE staff_profiles.id = auth.uid() 
        AND staff_profiles.role IN ('admin', 'super_admin', 'agent', 'support')
    )
  );

CREATE POLICY "Staff can view all linked accounts" 
  ON public.linked_accounts 
  FOR SELECT 
  USING (
    EXISTS (
        SELECT 1 FROM public.staff_profiles 
        WHERE staff_profiles.id = auth.uid() 
        AND staff_profiles.role IN ('admin', 'super_admin', 'agent', 'support')
    )
  );

CREATE POLICY "Staff can view all transactions" 
  ON public.transactions 
  FOR SELECT 
  USING (
    EXISTS (
        SELECT 1 FROM public.staff_profiles 
        WHERE staff_profiles.id = auth.uid() 
        AND staff_profiles.role IN ('admin', 'super_admin', 'agent', 'support')
    )
  );
