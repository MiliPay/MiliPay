-- Migration: 20260921092010_security_snapshot_function.sql
-- Description:
--   Schema drift detection.
--
--   The problem this solves: on 2026-09-21 the live database was found to
--   contain three wide-open RLS policies that appear in no migration, while a
--   policy that *is* in a migration was absent, and a function had a different
--   signature from the one every migration referenced. The repository was not
--   a description of the running system, so no security review of the code
--   could be trusted.
--
--   pg_dump is the usual answer, but it needs Docker or a local Postgres
--   client, neither of which is available on every machine here. Instead the
--   database describes its own security surface as JSON, which a script can
--   fetch over PostgREST with nothing but a service-role key and compare
--   against a committed snapshot.
--
--   Deliberately limited to what actually decides who can do what: RLS state,
--   policies, table and column privileges for the client roles, and every
--   function's security attributes. Column types and indexes are not included;
--   they are not security surface and they churn.

CREATE OR REPLACE FUNCTION public.security_snapshot()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'tables', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t->>'name'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'name', c.relname,
                 'rls_enabled', c.relrowsecurity,
                 'rls_forced', c.relforcerowsecurity
               ) AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ) s
    ),

    'policies', (
      SELECT COALESCE(jsonb_agg(p ORDER BY p->>'table', p->>'name'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'table', tablename,
                 'name', policyname,
                 'command', cmd,
                 'roles', (SELECT COALESCE(jsonb_agg(r ORDER BY r), '[]'::jsonb)
                           FROM unnest(roles) AS r),
                 'using', COALESCE(qual, ''),
                 'check', COALESCE(with_check, '')
               ) AS p
        FROM pg_policies
        WHERE schemaname = 'public'
      ) s
    ),

    -- Only the roles a client can actually authenticate as. postgres and
    -- service_role hold everything by design and would be pure noise.
    'table_grants', (
      SELECT COALESCE(jsonb_agg(g ORDER BY g->>'table', g->>'grantee', g->>'privilege'), '[]'::jsonb)
      FROM (
        SELECT DISTINCT jsonb_build_object(
                 'table', table_name,
                 'grantee', grantee,
                 'privilege', privilege_type
               ) AS g
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
          -- REFERENCES/TRIGGER/TRUNCATE cannot read or change row data.
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      ) s
    ),

    'column_grants', (
      SELECT COALESCE(jsonb_agg(g ORDER BY g->>'table', g->>'grantee', g->>'privilege'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'table', table_name,
                 'grantee', grantee,
                 'privilege', privilege_type,
                 'columns', jsonb_agg(column_name ORDER BY column_name)
               ) AS g
        FROM information_schema.column_privileges
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
        GROUP BY table_name, grantee, privilege_type
      ) s
    ),

    'functions', (
      SELECT COALESCE(jsonb_agg(f ORDER BY f->>'name', f->>'args'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'name', p.proname,
                 'args', pg_get_function_identity_arguments(p.oid),
                 'security_definer', p.prosecdef,
                 'search_path_pinned', (p.proconfig IS NOT NULL
                   AND EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                               WHERE cfg LIKE 'search_path=%')),
                 'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
                 'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
               ) AS f
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      ) s
    )
  );
$$;

-- Reading this tells you exactly where the soft spots are, so it is not
-- something to expose to a client session.
REVOKE ALL ON FUNCTION public.security_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_snapshot() TO service_role;
