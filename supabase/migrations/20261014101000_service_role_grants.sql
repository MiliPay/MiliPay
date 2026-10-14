-- New tables in this project don't get table rights for service_role by
-- default (see login_codes, signup_sessions: each grants it explicitly).
-- 20261005090000_support_desk and 20261014100000_website_leads left it out,
-- so the Edge Functions that write these tables were refused:
--   support-desk  fraud_reports (report NIN misuse)
--   website       the waitlist, both applications and the agent list
-- Browsers still have no rights on any of them.

GRANT ALL ON public.fraud_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fraud_case_seq TO service_role;

GRANT ALL ON public.website_waitlist TO service_role;
GRANT ALL ON public.merchant_leads TO service_role;
GRANT ALL ON public.agent_applications TO service_role;
GRANT ALL ON public.agent_locations TO service_role;
