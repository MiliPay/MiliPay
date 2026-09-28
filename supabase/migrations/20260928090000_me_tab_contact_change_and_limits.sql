-- The Me tab's server side (redesign phase 4).
--
--   1. The daily limit is enforced again. get_customer_daily_spend counted only
--      status = 'success', a word the payment rail retired in 20260921141752
--      (every such row became 'delivered', and no new row is ever written with
--      it). So "spent today" was always ₦0 and no daily cap ever bit.
--   2. get_my_daily_spend(): the same figure, for the customer's own Account
--      limits screen, so the bar there is the number that is enforced.
--   3. The last linked bank cannot be unlinked: a customer needs one to pay.
--   4. A customer's email and phone change only through a code sent to the
--      new address. A guard refuses the app's direct write of those two
--      columns on the customer's own row; the contact-change Edge Function
--      writes them after the code is verified, and a verified phone becomes
--      the sign-in number.
--   5. Changing either one puts a security notice in the inbox.

-- ─── 1. The daily limit ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_customer_daily_spend(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_daily_spent NUMERIC(12, 2);
  v_today_wat   DATE;
BEGIN
  -- The calendar day in West Africa Time (Lagos, UTC+1).
  v_today_wat := (NOW() AT TIME ZONE 'Africa/Lagos')::DATE;

  -- Money that has left the customer, or is on its way out and not given
  -- back. A purchase still waiting on the bank (initiated) counts while it is
  -- fresh, so starting several at once cannot slip past the cap; one the
  -- customer abandoned stops counting after 30 minutes rather than holding
  -- their limit all day. Never-charged and refunded money never counts.
  SELECT COALESCE(SUM(amount), 0.00)
    INTO v_daily_spent
    FROM public.transactions
   WHERE (user_id = p_user_id OR customer_id = p_user_id)
     AND (created_at AT TIME ZONE 'Africa/Lagos')::DATE >= v_today_wat
     AND (
       status IN ('paid', 'fulfilling', 'fulfilment_pending', 'delivered',
                  'fulfilment_failed', 'refund_pending', 'refund_failed', 'quarantined')
       OR (status = 'initiated' AND created_at > NOW() - INTERVAL '30 minutes')
     );

  RETURN v_daily_spent;
END;
$$;

-- ─── 2. The customer's own figure ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_daily_spend()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_customer uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT id INTO v_customer FROM public.customers WHERE auth_user_id = v_uid;
  -- The same call enforceTransactionLimits makes: by customer id, which also
  -- matches rows written against the auth user.
  RETURN public.get_customer_daily_spend(coalesce(v_customer, v_uid));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_daily_spend() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_daily_spend() TO authenticated;

-- ─── 3. Keep one bank ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unlink_bank_account(target_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active  integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.linked_accounts
     WHERE id = target_account_id AND user_id = v_user_id AND is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found or not owned by user');
  END IF;

  -- Locked so two unlinks at once cannot each see "two left" and remove both.
  PERFORM 1 FROM public.linked_accounts WHERE user_id = v_user_id AND is_active FOR UPDATE;
  SELECT count(*) INTO v_active FROM public.linked_accounts WHERE user_id = v_user_id AND is_active;

  IF v_active <= 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'LAST_ACCOUNT',
      'error', 'You need at least one linked account to pay. Link another before unlinking this one.'
    );
  END IF;

  UPDATE public.linked_accounts
     SET is_active = false
   WHERE id = target_account_id
     AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 4. Contact change by code ──────────────────────────────────────────────

-- The app may still edit names and address directly; a customer's own email
-- and phone now change only through the contact-change Edge Function, after a
-- code. A guard rather than a REVOKE, because the staff portals edit customer
-- details under the same `authenticated` role and must keep working: the
-- guard refuses only a customer changing their OWN row. The Edge Function
-- writes with the service role (no auth.uid()), so it passes.
CREATE OR REPLACE FUNCTION public.guard_customer_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.auth_user_id
     AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
    RAISE EXCEPTION 'Your email and phone number change only with a code sent to the new one.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_contact() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_guard_contact ON public.customers;
CREATE TRIGGER customers_guard_contact
  BEFORE UPDATE OF email, phone ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_contact();

CREATE TABLE IF NOT EXISTS public.contact_change_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id        uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  new_email          text,
  -- 11-digit local form, as customers.phone stores it.
  new_phone          text,
  -- HMAC of the code, never the code itself.
  email_code_hash    text,
  phone_code_hash    text,
  email_sent_at      timestamptz,
  phone_sent_at      timestamptz,
  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  attempts           integer NOT NULL DEFAULT 0,
  resends            integer NOT NULL DEFAULT 0,
  expires_at         timestamptz NOT NULL,
  applied_at         timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (new_email IS NOT NULL OR new_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS contact_change_requests_user_idx
  ON public.contact_change_requests (user_id, created_at DESC);

-- Service role only: the Edge Function reads and writes it; nobody else.
ALTER TABLE public.contact_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_change_requests FROM anon, authenticated;

COMMENT ON TABLE public.contact_change_requests IS
  'Pending email/phone changes, each waiting on a code sent to the new address. Service role only (contact-change Edge Function).';

-- ─── 5. Tell the customer ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer;
  v_phone   text;
  v_email   text;
BEGIN
  BEGIN
    IF NEW.auth_user_id IS NULL THEN
      RETURN NULL;
    END IF;

    IF OLD.pin_hash IS NOT NULL AND NEW.pin_hash IS DISTINCT FROM OLD.pin_hash THEN
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'security', 'Your PIN was changed',
        'Your MiliPay PIN was just changed. If this wasn''t you, contact support now.');
    END IF;

    IF NEW.pin_locked_until IS NOT NULL AND NEW.pin_locked_until > now()
       AND (OLD.pin_locked_until IS NULL OR OLD.pin_locked_until <= now()) THEN
      v_minutes := greatest(1, ceil(extract(epoch FROM (NEW.pin_locked_until - now())) / 60)::integer);
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'security', 'PIN locked',
        'Too many wrong PIN attempts, so your PIN is locked for ' || v_minutes ||
        ' minutes. If this wasn''t you, contact support now.');
    END IF;

    IF OLD.password_changed_at IS NOT NULL
       AND NEW.password_changed_at IS DISTINCT FROM OLD.password_changed_at THEN
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'security', 'Your password was changed',
        'Your MiliPay password was just changed. If this wasn''t you, contact support now.');
    END IF;

    IF OLD.phone IS NOT NULL AND NEW.phone IS NOT NULL AND NEW.phone IS DISTINCT FROM OLD.phone THEN
      v_phone := CASE WHEN length(NEW.phone) >= 8
                      THEN left(NEW.phone, 4) || ' ••• ' || right(NEW.phone, 4)
                      ELSE NEW.phone END;
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'security', 'Your phone number was changed',
        'Your MiliPay number is now ' || v_phone ||
        '. Use it to sign in from now on. If this wasn''t you, contact support now.');
    END IF;

    IF OLD.email IS NOT NULL AND NEW.email IS NOT NULL
       AND lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
      v_email := CASE WHEN position('@' IN NEW.email) > 1
                      THEN left(NEW.email, 1) || '•••' || substr(NEW.email, position('@' IN NEW.email))
                      ELSE NEW.email END;
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'security', 'Your email was changed',
        'Your MiliPay email is now ' || v_email || '. If this wasn''t you, contact support now.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_credential_change] not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_credential_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_notify_credentials ON public.customers;
CREATE TRIGGER customers_notify_credentials
  AFTER UPDATE OF pin_hash, pin_locked_until, password_changed_at, phone, email ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_credential_change();
