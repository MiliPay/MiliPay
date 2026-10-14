-- Marketing website (design handoff, MiliPay Website.dc.html): the app
-- waitlist, merchant terminal applications, agent applications and the
-- public "Find an agent" list.
--
-- Nothing here is readable or writable from a browser. The website posts to
-- the `website` Edge Function, which validates, rate-limits per address and
-- writes with the service role.
--
-- agent_locations is the public face of an agent: a shop name, an address
-- and opening hours the team chooses to publish. It is deliberately not
-- staff_profiles, whose names and phone numbers are not for the open web.

-- ── Waitlist ────────────────────────────────────────────────────────────
-- One row per number: signing up twice is not an error, and the launch SMS
-- goes once (notified_at).
CREATE TABLE IF NOT EXISTS public.website_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^0[789][01][0-9]{8}$'),
  page text,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);
ALTER TABLE public.website_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_waitlist FROM anon, authenticated;

-- ── Merchant terminal applications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  cac_number text NOT NULL,
  business_type text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^0[789][01][0-9]{8}$'),
  email text NOT NULL,
  state text NOT NULL,
  tills text NOT NULL,
  settlement_bank text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_leads_new_idx ON public.merchant_leads (status, created_at DESC);
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_leads FROM anon, authenticated;

-- ── Agent applications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^0[789][01][0-9]{8}$'),
  email text NOT NULL,
  state text NOT NULL,
  area text NOT NULL,
  workplace text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'trained', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_applications_new_idx ON public.agent_applications (status, created_at DESC);
ALTER TABLE public.agent_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_applications FROM anon, authenticated;

-- ── Where to find an agent ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text NOT NULL,
  state text NOT NULL,
  hours text,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_locations_state_idx ON public.agent_locations (state, position) WHERE active;
ALTER TABLE public.agent_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_locations FROM anon, authenticated;
