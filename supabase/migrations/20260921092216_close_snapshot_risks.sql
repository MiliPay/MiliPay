-- Migration: 20260921092216_close_snapshot_risks.sql
-- Description:
--   The four risks the new schema-snapshot audit flagged on its first run.
--
--   1. vtu_settings had an unconditional SELECT policy for `public`, while
--      neither anon nor authenticated held a SELECT *grant* on the table. The
--      policy was wide open and the grant made it moot — so the mobile app's
--      margin lookup in vtuService.ts has been silently returning nothing and
--      falling back to hardcoded defaults, meaning customers may have been
--      shown surcharges that do not match the configured ones.
--
--      A customer legitimately needs to see the surcharge they will pay, so
--      the fix is a grant scoped to the pricing columns plus a policy scoped
--      to signed-in users, not an unconditional one for `public`.
--
--   2-4. delete_merchant_cascade, unlink_bank_account and
--      get_transactions_policies are SECURITY DEFINER with no pinned
--      search_path. A definer function that resolves unqualified names through
--      the caller's search_path can be made to run the caller's objects with
--      the definer's privileges. ALTER FUNCTION ... SET search_path pins it
--      without touching the bodies.

-- ─────────────────────────────────────────────────────────────
-- 1. vtu_settings: readable by signed-in users, writable by nobody but
--    administrators and service_role.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public read access to vtu_settings" ON public.vtu_settings;

CREATE POLICY "Signed-in users can read VTU pricing"
  ON public.vtu_settings FOR SELECT
  TO authenticated
  USING (true);

-- updated_by names the administrator who last changed pricing; that is
-- operational detail a customer has no reason to see.
REVOKE SELECT ON public.vtu_settings FROM anon, authenticated;
GRANT SELECT (
  id,
  data_surcharge_ngn,
  cable_surcharge_ngn,
  power_convenience_fee_ngn,
  airtime_surcharge_percent,
  updated_at
) ON public.vtu_settings TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Pin search_path on the three unpinned SECURITY DEFINER functions.
--    Schemas chosen to match what each body actually references, so nothing
--    that resolved before stops resolving.
-- ─────────────────────────────────────────────────────────────
ALTER FUNCTION public.delete_merchant_cascade(UUID)    SET search_path = public, auth;
ALTER FUNCTION public.unlink_bank_account(UUID)        SET search_path = public, auth;
ALTER FUNCTION public.get_transactions_policies()      SET search_path = public;
