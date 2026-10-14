-- The same gap as 20261014101000, on older tables the Edge Functions use.
-- service_role had no rights on them, so each of these failed quietly:
--   audit_events            every audit row written from a function (_shared/audit.ts)
--   identity_verifications  enrol-customer, verify-identity
--   platform_settings       signup's rules; the "require two-factor" check (_shared/auth.ts)
--   vtu_settings            vtu-service
--   customer_notifications, push_tokens   _shared/push.ts
--   bank_name_mismatches    link-mono-account
-- Browsers still have no rights on any of them.

-- The audit log is append-only: functions add rows and read them, never change them.
GRANT SELECT, INSERT ON public.audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO service_role;

GRANT ALL ON public.identity_verifications TO service_role;
GRANT ALL ON public.platform_settings TO service_role;
GRANT ALL ON public.vtu_settings TO service_role;
GRANT ALL ON public.customer_notifications TO service_role;
GRANT ALL ON public.push_tokens TO service_role;
GRANT ALL ON public.bank_name_mismatches TO service_role;
