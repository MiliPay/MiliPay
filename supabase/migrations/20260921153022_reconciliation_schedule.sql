-- Migration: 20260921153022_reconciliation_schedule.sql
-- Description:
--   The sweep that finishes what the request/response path cannot: BigiSub
--   transactions left "processing", refunds that failed, and anything stuck
--   holding a customer's money.
--
--   On the secret. The cron job has to authenticate to the Edge Function, and
--   pg_cron job definitions are readable by the database owner. So this does
--   NOT use the service role key — a leak there is catastrophic, whereas a
--   leak of a reconcile-only token merely lets somebody trigger a sweep.
--
--   The secret is generated HERE, inside Postgres, and stored in Vault. It is
--   never printed, never passed through a client, and never appears in a
--   shell history or a transcript. The Edge Function does not hold a copy: it
--   sends the candidate to reconcile_secret_matches() and Postgres answers
--   yes or no.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'reconcile_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'reconcile_secret',
      'Auth header for vtu-reconcile. Scoped to triggering a sweep only.'
    );
  END IF;
END;
$$;

-- Comparison happens inside Postgres so the Edge Function never holds the
-- secret. Compares digests rather than the raw values: the comparison then
-- takes the same shape regardless of how much of the candidate was correct.
CREATE OR REPLACE FUNCTION public.reconcile_secret_matches(p_candidate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_candidate IS NULL OR length(p_candidate) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'reconcile_secret';

  -- No secret configured means nothing is authorised. Never fail open.
  IF v_secret IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN extensions.digest(p_candidate, 'sha256') = extensions.digest(v_secret, 'sha256');
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_secret_matches(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_secret_matches(TEXT) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'functions_base_url') THEN
    PERFORM vault.create_secret(
      'https://hkhnduxbxfcqjgrdnqcz.supabase.co/functions/v1',
      'functions_base_url',
      'Base URL for Edge Function calls made from pg_cron.'
    );
  END IF;
END;
$$;

-- Fires one sweep task at the Edge Function.
CREATE OR REPLACE FUNCTION public.run_reconcile_task(p_task TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, net
AS $$
DECLARE
  v_secret  TEXT;
  v_url     TEXT;
  v_request BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'reconcile_secret';
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'functions_base_url';

  IF v_secret IS NULL OR v_url IS NULL THEN
    RAISE WARNING 'reconcile: vault is missing reconcile_secret or functions_base_url';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url || '/vtu-reconcile',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-reconcile-secret', v_secret
               ),
    body    := jsonb_build_object('task', p_task),
    timeout_milliseconds := 25000
  ) INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.run_reconcile_task(TEXT) FROM PUBLIC, anon, authenticated;

-- Schedules. The cadences follow what each task is waiting for rather than a
-- uniform tick: requery chases an operator that answers in seconds to minutes,
-- refunds have their own backoff and only need the queue drained, and the
-- stuck/wallet checks exist to be noticed by a person.
SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('vtu-requery', 'vtu-refunds', 'vtu-stuck', 'vtu-wallet');

SELECT cron.schedule('vtu-requery', '*/2 * * * *',  $$SELECT public.run_reconcile_task('requery')$$);
SELECT cron.schedule('vtu-refunds', '*/5 * * * *',  $$SELECT public.run_reconcile_task('refunds')$$);
SELECT cron.schedule('vtu-stuck',   '*/15 * * * *', $$SELECT public.run_reconcile_task('stuck')$$);
SELECT cron.schedule('vtu-wallet',  '*/15 * * * *', $$SELECT public.run_reconcile_task('wallet')$$);
