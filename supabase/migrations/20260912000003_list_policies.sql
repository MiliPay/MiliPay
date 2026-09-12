-- Migration: 20260912000003_list_policies.sql

CREATE OR REPLACE FUNCTION public.get_transactions_policies()
RETURNS TABLE(policyname name, cmd text, roles name[], qual text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.policyname, p.cmd, p.roles, p.qual
  FROM pg_policies p
  WHERE p.tablename = 'transactions';
$$;

GRANT EXECUTE ON FUNCTION public.get_transactions_policies() TO authenticated, anon, service_role;
