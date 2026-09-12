-- Migration: 20260912000000_create_merchants_and_pos_terminals.sql
-- Description: Create enterprise merchants and pos_terminals tables with RLS and Mono settlement rails.

-- 1. Create merchants table
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,                -- 'retail', 'supermarket', 'dining', 'fuel', 'pharmacy', 'services'
  address TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Lagos',
  cac_rc_number TEXT,
  director_name TEXT NOT NULL,
  director_phone TEXT NOT NULL,
  director_bvn TEXT,
  
  -- Mono Settlement Configuration
  settlement_bank_name TEXT NOT NULL,
  settlement_bank_code TEXT NOT NULL,    -- 3-digit CBN bank code (e.g. '058' for GTB)
  settlement_account_number TEXT NOT NULL,
  settlement_account_name TEXT NOT NULL,
  mono_subaccount_id TEXT UNIQUE,        -- Mono Sub-Account ID for split payments
  
  -- Business Rules & Fees
  platform_fee_percent NUMERIC(4, 2) NOT NULL DEFAULT 1.50, -- 1.50%
  settlement_schedule TEXT NOT NULL DEFAULT 'instant',      -- 'instant' or 'daily_eod'
  
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  onboarded_by UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create pos_terminals table (HFSecurity HP605PV / VP930Pro / MP50)
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id TEXT UNIQUE NOT NULL,      -- e.g. 'TID-HP605-0001'
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  device_serial_number TEXT UNIQUE NOT NULL,
  device_model TEXT NOT NULL DEFAULT 'HFSecurity HP605PV',
  terminal_api_key_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat TIMESTAMPTZ,
  assigned_by UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Upgrade transactions schema for terminal association
ALTER TABLE IF EXISTS public.transactions 
  ADD COLUMN IF NOT EXISTS terminal_id TEXT;

-- 4. High performance indexes
CREATE INDEX IF NOT EXISTS idx_merchants_status ON public.merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_category ON public.merchants(category);
CREATE INDEX IF NOT EXISTS idx_merchants_mono_subaccount ON public.merchants(mono_subaccount_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_merchant_id ON public.pos_terminals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_tid ON public.pos_terminals(terminal_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_serial ON public.pos_terminals(device_serial_number);

-- 5. Row Level Security
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

-- Staff read access: Admins, Agents, and Support can view merchants
CREATE POLICY "Staff can view merchants"
  ON public.merchants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
    )
  );

-- Staff insert access: Agents, Admins can register merchants
CREATE POLICY "Agents and Admins can create merchants"
  ON public.merchants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('agent', 'admin', 'super_admin')
    )
  );

-- Admin manage access: Admins can update/delete merchants
CREATE POLICY "Admins can update merchants"
  ON public.merchants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Terminals RLS: Staff can view terminals
CREATE POLICY "Staff can view terminals"
  ON public.pos_terminals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
    )
  );

-- Agents and Admins can register/bind terminals
CREATE POLICY "Staff can register terminals"
  ON public.pos_terminals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('agent', 'admin', 'super_admin')
    )
  );

-- Admins can update/manage terminals
CREATE POLICY "Admins can update terminals"
  ON public.pos_terminals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role IN ('admin', 'super_admin')
    )
  );

-- 6. Table Grants
GRANT ALL ON public.merchants TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.pos_terminals TO postgres, anon, authenticated, service_role;
