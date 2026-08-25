-- Create the support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id text NOT NULL UNIQUE, -- E.g. TKT-1092
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    issue_description text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    assigned_to uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Customer who created it, or staff
    started_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index for efficient querying by status and assignee
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_idx ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS support_tickets_customer_id_idx ON public.support_tickets(customer_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_support_tickets_updated_at_trigger
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_support_tickets_updated_at();

-- RLS Policies
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Admins and Support staff can view all tickets
CREATE POLICY "Admins and Support can view all tickets" 
    ON public.support_tickets 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support')
        )
    );

-- Admins and Support can insert/update tickets
CREATE POLICY "Admins and Support can manage tickets" 
    ON public.support_tickets 
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles 
            WHERE staff_profiles.id = auth.uid() 
            AND staff_profiles.role IN ('admin', 'super_admin', 'support')
        )
    );
