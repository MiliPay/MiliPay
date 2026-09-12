-- Migration: 20260912000002_merchant_admin_controls_and_agent_restrictions.sql
-- Description: Enable Admin merchant deletion & blacklisting, cascade cleanup, and restrict agent access to transactions.

-- 1. Update merchant status check constraint to include 'blacklisted'
ALTER TABLE public.merchants 
  DROP CONSTRAINT IF EXISTS merchants_status_check;

ALTER TABLE public.merchants 
  ADD CONSTRAINT merchants_status_check 
  CHECK (status IN ('pending', 'active', 'suspended', 'blacklisted'));

-- 2. Ensure transactions.merchant_id safely decouples (ON DELETE SET NULL) for financial compliance
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_merchant_id_fkey'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_merchant_id_fkey;
  END IF;

  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_merchant_id_fkey
    FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;
END $$;

-- 3. Row Level Security: Admin Deletion Policies
DROP POLICY IF EXISTS "Admins can delete merchants" ON public.merchants;
CREATE POLICY "Admins can delete merchants"
  ON public.merchants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete terminals" ON public.pos_terminals;
CREATE POLICY "Admins can delete terminals"
  ON public.pos_terminals
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

-- 4. Database-Level Security: Restrict Agent from viewing transaction history
-- Drop existing broad policy that permitted agents
DROP POLICY IF EXISTS "Staff can view all transactions" ON public.transactions;

-- Recreate policy strictly for Support, Admins, and Super Admins (EXCLUDING 'agent')
CREATE POLICY "Staff can view all transactions" 
  ON public.transactions 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles 
      WHERE staff_profiles.id = auth.uid() 
      AND staff_profiles.role IN ('admin', 'super_admin', 'support')
    )
  );

-- 5. Cascade Merchant Deletion RPC (Security Definer)
CREATE OR REPLACE FUNCTION public.delete_merchant_cascade(target_merchant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_auth_user_id UUID;
  v_business_name TEXT;
  v_terminals_deleted INT;
BEGIN
  -- 1. Verify caller is an authorized Admin
  SELECT role INTO v_caller_role
  FROM public.staff_profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'super_admin') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied. Only Administrators can permanently delete merchants.';
  END IF;

  -- 2. Fetch merchant info
  SELECT business_name, auth_user_id 
  INTO v_business_name, v_auth_user_id
  FROM public.merchants
  WHERE id = target_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant record not found with id: %', target_merchant_id;
  END IF;

  -- 3. Decouple transactions (retaining logs for CBN financial compliance)
  UPDATE public.transactions
  SET merchant_id = NULL
  WHERE merchant_id = target_merchant_id;

  -- 4. Delete associated POS terminals
  WITH deleted_terms AS (
    DELETE FROM public.pos_terminals
    WHERE merchant_id = target_merchant_id
    RETURNING id
  )
  SELECT count(*) INTO v_terminals_deleted FROM deleted_terms;

  -- 5. Delete merchant record
  DELETE FROM public.merchants
  WHERE id = target_merchant_id;

  -- 6. Clean up auth user if linked
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'merchant_id', target_merchant_id,
    'business_name', v_business_name,
    'terminals_deleted', v_terminals_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_merchant_cascade(UUID) TO authenticated, service_role;
