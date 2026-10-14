-- Supabase security advisor findings (2026-10-14).
--
-- 1. Functions without a fixed search_path resolve names through whatever
--    search_path the caller set. Pin them. Each uses only public tables and
--    built-ins (sha256, date_trunc), which pg_catalog always provides.
ALTER FUNCTION public.audit_event_hash(public.audit_events) SET search_path = public;
ALTER FUNCTION public.audit_events_immutable() SET search_path = public;
ALTER FUNCTION public.lagos_today() SET search_path = public;
ALTER FUNCTION public.refundable_status(text) SET search_path = public;
ALTER FUNCTION public.reject_mutation() SET search_path = public;
ALTER FUNCTION public.signup_status(public.signup_sessions) SET search_path = public;
ALTER FUNCTION public.signup_step_number(text) SET search_path = public;
ALTER FUNCTION public.terminal_state(boolean, timestamptz) SET search_path = public;

-- 2. Trigger functions were exposed as RPCs. A trigger function can't be run
--    that way, but nothing outside the database should be able to try.
--    Triggers keep firing: EXECUTE is checked when a trigger is created,
--    not each time it fires.
REVOKE ALL ON FUNCTION public.audit_events_chain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customers_default_pin() FROM PUBLIC, anon, authenticated;

-- Left as they are, by design:
--   * RLS on with no policies (refund_requests, fraud_reports, website_* ...):
--     these tables are reached only through checked functions.
--   * staff_sign_in_rules() is readable before sign-in: the login page needs it.
--   * SECURITY DEFINER RPCs callable by signed-in users: each asserts the
--     caller's role (assert_admin / assert_staff) before doing anything.
