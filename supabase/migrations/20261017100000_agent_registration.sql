-- Agent Register customer and Register merchant (design handoff, agent
-- portal screens 4 and 6).
--
-- Register customer starts with the customer's phone and an SMS code, so an
-- agent can't enrol someone on a number they don't hold. The code is checked
-- by the agent-upgrade Edge Function and enrol-customer consumes the check.
-- Register merchant can take "Use my location".

CREATE TABLE IF NOT EXISTS public.agent_phone_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text,
  sent_at timestamptz,
  resends int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  code_verified_at timestamptz,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_phone_checks_phone_idx ON public.agent_phone_checks (phone, created_at DESC);
ALTER TABLE public.agent_phone_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_phone_checks FROM anon, authenticated;
GRANT ALL ON public.agent_phone_checks TO service_role;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS location_captured_at timestamptz;
