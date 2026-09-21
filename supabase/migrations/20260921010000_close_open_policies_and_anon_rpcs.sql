-- Migration: 20260921010000_close_open_policies_and_anon_rpcs.sql
-- Description:
--   Closes gaps found by inspecting the live database after 20260921000000
--   was applied. None of these are in any migration file — they were created
--   in the dashboard and only exist in production, which is why no amount of
--   reading the repo would have shown them.
--
--   1. public.customers carried the Supabase dashboard's default template
--      policies: "Enable read access for all users" (SELECT true) and
--      "Enable update for all users" (UPDATE true), both for role `public`.
--      RLS policies are OR'd, so these silently overrode every scoped policy
--      on the table, including the ones added in 20260921000000. Any signed-in
--      customer could read every other customer's name, phone, email, address,
--      date of birth and NIN last-4, and rewrite their contact details.
--
--   2. 20260921000000 tried to DROP approve_customer_kyc(UUID) but the live
--      function is approve_customer_kyc(UUID, UUID), so the drop silently did
--      nothing and the bypass RPC is still there.
--
--   3. Twelve SECURITY DEFINER functions are executable by `anon`. Each one
--      checks the caller's role internally and so fails closed today, but an
--      unauthenticated caller should never reach a definer function that
--      creates staff or deletes customers in the first place.

-- ─────────────────────────────────────────────────────────────
-- 1. REMOVE THE WIDE-OPEN POLICIES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Enable read access for all users" ON public.customers;
DROP POLICY IF EXISTS "Enable update for all users"      ON public.customers;
DROP POLICY IF EXISTS "Enable insert for all users"      ON public.customers;
DROP POLICY IF EXISTS "Agents can insert customers"      ON public.customers;
DROP POLICY IF EXISTS "Enable insert access for all users transactions" ON public.transactions;

-- Dropping the blanket SELECT above takes staff visibility with it: the
-- "Staff can view customers" policy from 00000000000001 is not present in the
-- live database, so the blanket policy was the only thing letting an
-- administrator see a customer at all. Restore it deliberately.
--
-- Agents are excluded here on purpose. They keep "Agents can read own
-- registered customers", which scopes them to their own enrolments and matches
-- what the agent portal already asks for (fetchCustomers({ registeredBy })).
DROP POLICY IF EXISTS "Staff can view customers" ON public.customers;
CREATE POLICY "Staff can view customers"
  ON public.customers FOR SELECT
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '')
      IN ('admin', 'super_admin', 'superAdmin', 'support')
  );

-- DELETE was granted to anon and authenticated. Only the admin-scoped ALL
-- policy permits it today, so this was not exploitable, but the grant has no
-- reason to exist: customer deletion goes through delete_customer_user.
REVOKE DELETE ON public.customers FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. DROP THE KYC BYPASS RPCS — CORRECT SIGNATURES THIS TIME
--    Approval mints an auth identity and dispatches a credential. It has one
--    code path: the approve-customer Edge Function.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approve_customer_kyc(UUID, UUID);
DROP FUNCTION IF EXISTS public.approve_customer_kyc(UUID);
DROP FUNCTION IF EXISTS public.reject_customer_kyc(UUID, TEXT);

-- ─────────────────────────────────────────────────────────────
-- 3. NO SECURITY DEFINER FUNCTION IS REACHABLE WITHOUT SIGNING IN
--    Each still enforces its own role check; this removes the outer door.
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_staff_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_staff_user(UUID)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_customer_user(UUID)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_merchant_cascade(UUID)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unlink_bank_account(UUID)       FROM PUBLIC, anon;

-- Trigger functions. A trigger runs them regardless of EXECUTE, so nothing
-- needs this privilege and neither role should be able to call them directly.
REVOKE EXECUTE ON FUNCTION public.create_partition_and_insert()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_staff_profile_delete_cascade_auth() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                      FROM PUBLIC, anon, authenticated;

-- Debug helper that lists RLS policies. Not something to expose over the API.
REVOKE EXECUTE ON FUNCTION public.get_transactions_policies() FROM PUBLIC, anon, authenticated;

-- Takes an arbitrary user id and returns that person's spend, with no internal
-- authorization check at all. Only the payment functions need it, and they run
-- as service_role. verify_own_pin is the pattern to follow if a customer ever
-- needs their own figure: scope it to auth.uid() inside the function.
REVOKE EXECUTE ON FUNCTION public.get_customer_daily_spend(UUID) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. tier_caps was added in 20260921000000 without a fixed search_path.
--    It is IMMUTABLE and trivial, but a mutable search_path on any function
--    is a schema-shadowing foothold, and the linter is right to flag it.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tier_caps(p_tier INT)
RETURNS TABLE (max_single NUMERIC, max_daily NUMERIC)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE p_tier WHEN 1 THEN 50000::NUMERIC  WHEN 3 THEN 250000::NUMERIC  ELSE 150000::NUMERIC END,
    CASE p_tier WHEN 1 THEN 200000::NUMERIC WHEN 3 THEN 1000000::NUMERIC ELSE 500000::NUMERIC END;
$$;

REVOKE ALL ON FUNCTION public.tier_caps(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tier_caps(INT) TO authenticated, service_role;
