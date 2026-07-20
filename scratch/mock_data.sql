-- 1. Drop existing transactions if it exists (CASCADE to drop partitions if any)
DROP TABLE IF EXISTS public.transactions CASCADE;

-- 2. Create the customers table (matches the frontend Customer type)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    nin_last_4 TEXT,
    state TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    captured_fingers JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.customers;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.customers;
DROP POLICY IF EXISTS "Enable update for all users" ON public.customers;

CREATE POLICY "Enable read access for all users" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.customers FOR UPDATE USING (true);

GRANT ALL ON public.customers TO anon;
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

-- 3. Create transactions table (matches the frontend Transaction type)
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.customers(id),
    merchant_name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users transactions" ON public.transactions FOR INSERT WITH CHECK (true);

GRANT ALL ON public.transactions TO anon;
GRANT ALL ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

-- 4. Seed Mock Customers
-- Let's TRUNCATE first to avoid duplicate phone number errors if you ran it already
TRUNCATE TABLE public.customers CASCADE;

INSERT INTO public.customers (id, first_name, last_name, phone, email, nin_last_4, state, status, captured_fingers)
VALUES 
(gen_random_uuid(), 'Adewale', 'Ogundimu', '08012345671', 'adewale@example.com', '1234', 'Lagos', 'active', '["thumb", "index", "middle", "ring"]'),
(gen_random_uuid(), 'Chidinma', 'Okafor', '08123456782', 'chidinma@example.com', '5678', 'Abuja', 'pending', '["thumb", "index", "middle", "ring"]'),
(gen_random_uuid(), 'Abubakar', 'Sani', '07034567893', 'abubakar@example.com', '9012', 'Kano', 'active', '["thumb", "index", "middle", "ring"]'),
(gen_random_uuid(), 'Funke', 'Adebayo', '09045678904', 'funke@example.com', '3456', 'Oyo', 'suspended', '["thumb", "index", "middle", "ring"]'),
(gen_random_uuid(), 'Ngozi', 'Eze', '08056789015', 'ngozi@example.com', '7890', 'Rivers', 'active', '["thumb", "index", "middle", "ring"]');

-- 5. Seed Mock Transactions
DO $$
DECLARE
    cust1_id UUID;
    cust2_id UUID;
BEGIN
    SELECT id INTO cust1_id FROM public.customers WHERE phone = '08012345671' LIMIT 1;
    SELECT id INTO cust2_id FROM public.customers WHERE phone = '08123456782' LIMIT 1;

    INSERT INTO public.transactions (customer_id, merchant_name, amount, status, reference, created_at)
    VALUES 
    (cust1_id, 'Shoprite Lekki', 500000, 'success', 'FLW-2026-A1B2C3', NOW() - INTERVAL '1 day'),
    (cust1_id, 'Chicken Republic', 1500000, 'pending', 'FLW-2026-D4E5F6', NOW() - INTERVAL '2 hours'),
    (cust2_id, 'Total Filling Station', 20000, 'failed', 'FLW-2026-G7H8I9', NOW() - INTERVAL '5 days');
END $$;
