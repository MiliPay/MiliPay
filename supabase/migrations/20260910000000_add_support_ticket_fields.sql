-- Add fields to support_tickets for the new L1/L2 workflow

-- Record who solved the ticket (either Support Staff or Admin)
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS solved_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;

-- Add a subject/title field for when tickets are formalized or escalated
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject text;

-- Update RLS to ensure customers can see their formal subjects and who solved it, and staff can update it
-- (Since RLS is already set for SELECT/UPDATE on the whole table, adding columns doesn't require new policies,
-- but we just want to be sure).
