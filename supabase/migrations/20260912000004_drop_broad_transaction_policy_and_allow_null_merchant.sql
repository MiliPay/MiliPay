-- Migration: 20260912000004_drop_broad_transaction_policy_and_allow_null_merchant.sql
-- Description: Drop permissive public read policy on transactions, and make merchant_id nullable for decoupling.

-- 1. Drop permissive public read policy so Agent restriction is strictly enforced
DROP POLICY IF EXISTS "Enable read access for all users transactions" ON public.transactions;

-- 2. Make merchant_id nullable on transactions for decoupling & compliance
ALTER TABLE public.transactions ALTER COLUMN merchant_id DROP NOT NULL;

-- 3. Upgrade delete_merchant_cascade RPC with safe role check
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
  -- 1. Verify caller is an authorized Admin or service_role
  SELECT role INTO v_caller_role
  FROM public.staff_profiles
  WHERE id = auth.uid();

  IF coalesce(v_caller_role, '') NOT IN ('admin', 'super_admin') 
     AND coalesce((auth.jwt() ->> 'role'), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'service_role') THEN
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
