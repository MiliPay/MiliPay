-- Palm tab controls (redesign phase 7): pause palm payments, and choose which
-- linked account palm payments come from. Both are enforced where palm money
-- moves (process-payment), not just shown in the app.
--
--   palm_paused      terminals decline this customer's palm while true
--   palm_account_id  the account palm payments are recorded against; when it
--                    is unset or no longer active, the customer's oldest
--                    active linked account is used (the "Palm default")
--
-- Customers change them only through the two RPCs below, which check the
-- account is their own and active. Every change lands in their inbox, so a
-- change they didn't make is noticed.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS palm_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS palm_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS palm_account_id uuid REFERENCES public.linked_accounts(id) ON DELETE SET NULL;

-- The account palm payments use: the chosen one while it is active and the
-- customer's own, otherwise their oldest active account. NULL when none.
CREATE OR REPLACE FUNCTION public.palm_account_for(p_customer_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT la.id
       FROM public.customers c
       JOIN public.linked_accounts la ON la.id = c.palm_account_id
      WHERE c.id = p_customer_id
        AND la.user_id = c.auth_user_id
        AND la.is_active),
    (SELECT la.id
       FROM public.customers c
       JOIN public.linked_accounts la ON la.user_id = c.auth_user_id
      WHERE c.id = p_customer_id
        AND la.is_active
      ORDER BY la.created_at, la.id
      LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.palm_account_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.palm_account_for(uuid) TO service_role;

-- Everything the Palm tab shows, from the caller's own row.
CREATE OR REPLACE FUNCTION public.get_my_palm()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_c       record;
  v_account uuid;
  v_acct    record;
  v_agent   text;
  v_spent   numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, has_palm_template, palm_paused, palm_paused_at, created_at, registered_by
    INTO v_c
    FROM public.customers
   WHERE auth_user_id = v_uid
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  v_account := public.palm_account_for(v_c.id);
  IF v_account IS NOT NULL THEN
    SELECT id, bank_name, right(account_number, 4) AS last4 INTO v_acct
      FROM public.linked_accounts WHERE id = v_account;
  END IF;

  SELECT full_name INTO v_agent FROM public.staff_profiles WHERE id = v_c.registered_by;

  -- Palm payments today (WAT), counted the way the daily limit counts them.
  SELECT coalesce(sum(amount), 0)
    INTO v_spent
    FROM public.transactions
   WHERE (customer_id = v_c.id OR user_id = v_uid)
     AND (merchant_id IS NOT NULL OR terminal_id IS NOT NULL)
     AND (created_at AT TIME ZONE 'Africa/Lagos')::date >= (now() AT TIME ZONE 'Africa/Lagos')::date
     AND status IN ('paid', 'fulfilling', 'fulfilment_pending', 'delivered',
                    'fulfilment_failed', 'refund_pending', 'refund_failed', 'quarantined');

  RETURN json_build_object(
    'found', true,
    'hasPalm', coalesce(v_c.has_palm_template, false),
    'paused', v_c.palm_paused,
    'pausedAt', v_c.palm_paused_at,
    'enrolledAt', v_c.created_at,
    'agentName', v_agent,
    'spentToday', v_spent,
    'account', CASE WHEN v_acct.id IS NULL THEN NULL
                    ELSE json_build_object('id', v_acct.id, 'bankName', v_acct.bank_name, 'last4', v_acct.last4) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_palm_paused(p_paused boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_paused IS NULL THEN
    RAISE EXCEPTION 'Say whether palm payments are paused';
  END IF;

  UPDATE public.customers
     SET palm_paused = p_paused,
         palm_paused_at = CASE WHEN p_paused THEN coalesce(palm_paused_at, now()) ELSE NULL END
   WHERE auth_user_id = v_uid;

  RETURN public.get_my_palm();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_palm_account(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.linked_accounts
     WHERE id = p_account_id AND user_id = v_uid AND is_active
  ) THEN
    RETURN json_build_object('found', true, 'error', 'That account is not one of your linked accounts.');
  END IF;

  UPDATE public.customers SET palm_account_id = p_account_id WHERE auth_user_id = v_uid;

  RETURN public.get_my_palm();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_palm() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_palm_paused(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_palm_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_palm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_palm_paused(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_palm_account(uuid) TO authenticated, service_role;

-- Inbox notices for palm changes (kind 'palm'), from the database, so they
-- are written whoever made the change.
CREATE OR REPLACE FUNCTION public.notify_palm_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acct record;
BEGIN
  BEGIN
    IF NEW.auth_user_id IS NULL THEN
      RETURN NULL;
    END IF;

    IF NEW.palm_paused IS DISTINCT FROM OLD.palm_paused THEN
      IF NEW.palm_paused THEN
        PERFORM public.notify_customer(
          NEW.auth_user_id, 'palm', 'Palm payments paused',
          'Terminals will decline your palm until you turn palm payments back on. If this wasn''t you, contact support now.');
      ELSE
        PERFORM public.notify_customer(
          NEW.auth_user_id, 'palm', 'Palm payments are back on',
          'You can pay with your palm at any MiliPay terminal again.');
      END IF;
    END IF;

    IF NEW.palm_account_id IS DISTINCT FROM OLD.palm_account_id AND NEW.palm_account_id IS NOT NULL THEN
      SELECT bank_name, right(account_number, 4) AS last4 INTO v_acct
        FROM public.linked_accounts WHERE id = NEW.palm_account_id;
      PERFORM public.notify_customer(
        NEW.auth_user_id, 'palm', 'Palm payments account changed',
        'Palm payments now come from ' || coalesce(v_acct.bank_name, 'your bank') ||
        ' ••' || coalesce(v_acct.last4, '') || '. If this wasn''t you, contact support now.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_palm_settings] %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS customers_palm_settings_notice ON public.customers;
CREATE TRIGGER customers_palm_settings_notice
  AFTER UPDATE OF palm_paused, palm_account_id ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_palm_settings();
