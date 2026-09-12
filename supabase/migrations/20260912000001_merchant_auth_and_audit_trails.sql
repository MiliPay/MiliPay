-- Migration: 20260912000001_merchant_auth_and_audit_trails.sql
-- Description: Add merchant auth credentials, link auth_user_id, audit trail tracking, and merchant RLS.

-- 1. Add email and auth_user_id to public.merchants
ALTER TABLE IF EXISTS public.merchants
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Ensure pos_terminals.assigned_by has foreign key to staff_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_terminals_assigned_by_fkey'
  ) THEN
    ALTER TABLE public.pos_terminals
      ADD CONSTRAINT pos_terminals_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Indexes for fast merchant auth and audit lookups
CREATE INDEX IF NOT EXISTS idx_merchants_auth_user_id ON public.merchants(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_email ON public.merchants(email);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_assigned_by ON public.pos_terminals(assigned_by);
CREATE INDEX IF NOT EXISTS idx_transactions_terminal_id ON public.transactions(terminal_id);

-- 4. Merchant Portal RLS Policies:
-- Merchants can view their own business record
DROP POLICY IF EXISTS "Merchants can view own business record" ON public.merchants;
CREATE POLICY "Merchants can view own business record"
  ON public.merchants
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'merchant_id')::uuid = id
  );

-- Merchants can update select profile fields (e.g. address)
DROP POLICY IF EXISTS "Merchants can update own business record" ON public.merchants;
CREATE POLICY "Merchants can update own business record"
  ON public.merchants
  FOR UPDATE
  USING (
    auth_user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'merchant_id')::uuid = id
  );

-- Merchants can view their own terminals
DROP POLICY IF EXISTS "Merchants can view own terminals" ON public.pos_terminals;
CREATE POLICY "Merchants can view own terminals"
  ON public.pos_terminals
  FOR SELECT
  USING (
    merchant_id IN (
      SELECT id FROM public.merchants 
      WHERE auth_user_id = auth.uid() 
      OR (auth.jwt() -> 'app_metadata' ->> 'merchant_id')::uuid = id
    )
  );

-- Merchants can view their own transactions
DROP POLICY IF EXISTS "Merchants can view own transactions" ON public.transactions;
CREATE POLICY "Merchants can view own transactions"
  ON public.transactions
  FOR SELECT
  USING (
    merchant_id IN (
      SELECT id FROM public.merchants 
      WHERE auth_user_id = auth.uid() 
      OR (auth.jwt() -> 'app_metadata' ->> 'merchant_id')::uuid = id
    )
  );
