-- Migration: 20260914000000_customer_kyc_tiers_and_pin_thresholds.sql
-- Description: Adds kyc_tier (1, 2, 3) and customer-configurable pin_threshold (default 10k) with daily spend calculation

-- 1. Upgrade public.customers
ALTER TABLE IF EXISTS public.customers 
  ADD COLUMN IF NOT EXISTS kyc_tier INT NOT NULL DEFAULT 2 CHECK (kyc_tier IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS pin_threshold NUMERIC(12, 2) NOT NULL DEFAULT 10000.00;

-- 2. Upgrade public.users
ALTER TABLE IF EXISTS public.users 
  ADD COLUMN IF NOT EXISTS kyc_tier INT NOT NULL DEFAULT 2 CHECK (kyc_tier IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS pin_threshold NUMERIC(12, 2) NOT NULL DEFAULT 10000.00;

-- 3. Backfill existing customers to Tier 2 (since NIN + Palm scan is confirmed) and ₦10,000 default threshold
UPDATE public.customers SET kyc_tier = 2 WHERE kyc_tier IS NULL;
UPDATE public.customers SET pin_threshold = 10000.00 WHERE pin_threshold IS NULL;
UPDATE public.users SET kyc_tier = 2 WHERE kyc_tier IS NULL;
UPDATE public.users SET pin_threshold = 10000.00 WHERE pin_threshold IS NULL;

-- 4. High performance index for daily volume calculation
CREATE INDEX IF NOT EXISTS idx_transactions_user_daily_volume 
  ON public.transactions(user_id, status, created_at DESC);

-- 5. Stored function: Calculate customer daily spend in West Africa Time (WAT: UTC+1)
CREATE OR REPLACE FUNCTION public.get_customer_daily_spend(p_user_id UUID)
RETURNS NUMERIC(12, 2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_spent NUMERIC(12, 2);
  v_today_wat DATE;
BEGIN
  -- Determine current calendar date in West Africa Time (Lagos, UTC+1)
  v_today_wat := (NOW() AT TIME ZONE 'Africa/Lagos')::DATE;

  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_daily_spent
  FROM public.transactions
  WHERE (user_id = p_user_id OR customer_id = p_user_id)
    AND status = 'success'
    AND (created_at AT TIME ZONE 'Africa/Lagos')::DATE >= v_today_wat;

  RETURN v_daily_spent;
END;
$$;

-- Grant execution privileges on function
GRANT EXECUTE ON FUNCTION public.get_customer_daily_spend(UUID) TO authenticated, service_role;
