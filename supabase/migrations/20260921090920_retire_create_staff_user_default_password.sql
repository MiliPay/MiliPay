-- Migration: 20260921090920_retire_create_staff_user_default_password.sql
-- Description:
--   create_staff_user carried `p_password text DEFAULT 'Password12$'`, so a
--   caller who omitted the argument silently provisioned a staff account with
--   a guessable password shared across every such account.
--
--   Staff creation now has a single path: the create-staff Edge Function,
--   which generates the password with crypto and sends it to the staff
--   member's phone. Nothing in the app calls this RPC any more.
--
--   The default cannot simply be dropped: p_state already carries one and sits
--   earlier in the signature, and Postgres refuses a non-default parameter
--   after a defaulted one. So the default becomes NULL and the body refuses a
--   missing or short password.

DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_staff_user';

  IF v_def IS NULL THEN
    RAISE NOTICE 'create_staff_user not present; nothing to do';
    RETURN;
  END IF;

  v_def := replace(
    v_def,
    'p_password text DEFAULT ''Password12$''::text',
    'p_password text DEFAULT NULL::text'
  );

  v_def := replace(
    v_def,
    'raise exception ''Forbidden: Only administrators can create staff accounts'';
  end if;',
    'raise exception ''Forbidden: Only administrators can create staff accounts'';
  end if;

  if p_password is null or length(p_password) < 12 then
    raise exception ''A password of at least 12 characters must be supplied'';
  end if;'
  );

  EXECUTE v_def;
END;
$$;

-- service_role only: an operator can still recover an account from the SQL
-- editor if the Edge Function is down, but no portal session can create staff
-- by a route that skips credential delivery.
REVOKE EXECUTE ON FUNCTION public.create_staff_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
