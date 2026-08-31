-- Add the missing address column that is collected during agent registration
ALTER TABLE public.customers
ADD COLUMN address text;
