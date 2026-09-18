-- Migration: 20260918190000_create_vtu_margin_settings.sql
-- Description: Creates persistent VTU profit margin and surcharge configuration for telecom vending

CREATE TABLE IF NOT EXISTS public.vtu_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  data_surcharge_ngn NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
  cable_surcharge_ngn NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
  power_convenience_fee_ngn NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  airtime_surcharge_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Seed baseline configuration row
INSERT INTO public.vtu_settings (
  id,
  data_surcharge_ngn,
  cable_surcharge_ngn,
  power_convenience_fee_ngn,
  airtime_surcharge_percent,
  updated_at,
  updated_by
)
VALUES (
  'default',
  25.00,
  30.00,
  0.00,
  0.00,
  NOW(),
  'system_bootstrap'
)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.vtu_settings ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated and anonymous clients (Edge Functions and Mobile Clients)
CREATE POLICY "Allow public read access to vtu_settings"
  ON public.vtu_settings
  FOR SELECT
  USING (true);

-- Allow update access to service role and authenticated users
CREATE POLICY "Allow update access to vtu_settings"
  ON public.vtu_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow insert access if needed
CREATE POLICY "Allow insert access to vtu_settings"
  ON public.vtu_settings
  FOR INSERT
  WITH CHECK (true);
