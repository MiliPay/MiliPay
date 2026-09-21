-- Migration: 20260921085544_revoke_public_execute_on_definer_functions.sql
-- Description:
--   Corrects 20260921010000, which revoked EXECUTE `FROM anon` and achieved
--   nothing.
--
--   Postgres grants EXECUTE on every new function to PUBLIC by default, and
--   `anon` inherits from PUBLIC. So `REVOKE EXECUTE ... FROM anon` removes a
--   grant that was never made to anon directly, leaves the PUBLIC grant in
--   place, and reports success. The privilege has to be taken from PUBLIC.
--
--   Verified after applying: all ten functions now report
--   has_function_privilege('anon', oid, 'EXECUTE') = false, while the ones the
--   portals and mobile app call keep their explicit `authenticated` grant.
--
--   (20260921010000 has been corrected in place for fresh deployments; this
--   migration is what repaired the already-migrated database.)

-- Called by the admin portal with an authenticated admin session. Each of
-- these enforces its own role check internally.
REVOKE EXECUTE ON FUNCTION public.create_staff_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_staff_user(UUID)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_customer_user(UUID)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_merchant_cascade(UUID) FROM PUBLIC, anon;
-- Called by the mobile app to unlink the caller's own bank account.
REVOKE EXECUTE ON FUNCTION public.unlink_bank_account(UUID)     FROM PUBLIC, anon;

-- Trigger functions: a trigger invokes them regardless of EXECUTE, so nobody
-- needs to be able to call them over the REST API.
REVOKE EXECUTE ON FUNCTION public.create_partition_and_insert()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_staff_profile_delete_cascade_auth() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                      FROM PUBLIC, anon, authenticated;

-- Debug helper listing RLS policies; service_role keeps it.
REVOKE EXECUTE ON FUNCTION public.get_transactions_policies() FROM PUBLIC, anon, authenticated;

-- Takes an arbitrary user id and returns that person's spend with no internal
-- authorization check. Only the payment path needs it, as service_role.
REVOKE EXECUTE ON FUNCTION public.get_customer_daily_spend(UUID) FROM PUBLIC, anon, authenticated;
