-- The customer's notification inbox (the app's bell and Notifications screen).
--
-- Written by the database itself, from triggers, rather than by each Edge
-- Function that happens to move money. A status can change from vtu-service,
-- the Mono webhook, the reconciler, a palm terminal or an administrator's
-- manual resolution; a trigger hears every one of them, so the inbox can never
-- miss an outcome because one writer forgot to say so. The push banner reads
-- its words from the row written here, so the banner and the inbox always say
-- the same thing.
--
-- Rules the copy keeps (the same ones the app's receipt keeps):
--   * nothing is called delivered until it is;
--   * a payment that never went through says nothing was charged, and never
--     blames the bank — it also covers a customer closing Mono's page;
--   * states that last seconds (initiated, paid, fulfilling, refund_pending)
--     are not worth a notification — the app shows them live.
--
-- A notification must never be the reason money fails to move. Every trigger
-- here catches its own errors and lets the statement that fired it succeed.

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The Notifications screen's filters: Payments · Palm · Security.
  kind        text NOT NULL CHECK (kind IN ('payment', 'palm', 'security')),
  -- The transaction's status when this was written, for its icon and colour.
  -- Null for security notices.
  status      text,
  -- The transaction it is about. Tapping the notification opens it.
  reference   text,
  title       text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS customer_notifications_user_idx
  ON public.customer_notifications (user_id, created_at DESC);

-- One notification per transaction per state. A webhook delivered twice, or a
-- transition retried, cannot put the same message in the inbox twice.
CREATE UNIQUE INDEX IF NOT EXISTS customer_notifications_once_per_state
  ON public.customer_notifications (reference, status)
  WHERE reference IS NOT NULL;

-- Enabled, not forced: the SECURITY DEFINER functions below write as the
-- table owner. Customers only ever read, and only their own.
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_notifications FROM anon, authenticated;
GRANT SELECT ON public.customer_notifications TO authenticated;

CREATE POLICY "Customers read their own notifications"
  ON public.customer_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.customer_notifications IS
  'Customer inbox. Written only by database triggers (transactions, linked_accounts, customers); read by the customer; marked read through mark_notifications_read().';

-- The bell's badge and the list update live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;


-- ─── Marking read ───────────────────────────────────────────────────────────
-- No UPDATE grant on the table: this is the only way a customer changes a
-- row, and all it can do is stamp read_at on their own.

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.customer_notifications
     SET read_at = now()
   WHERE user_id = v_uid
     AND read_at IS NULL
     AND (p_ids IS NULL OR id = ANY (p_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;


-- ─── Writing ────────────────────────────────────────────────────────────────

-- The one place a row is added. Swallows its own errors: see the header.
CREATE OR REPLACE FUNCTION public.notify_customer(
  p_user_id   uuid,
  p_kind      text,
  p_title     text,
  p_body      text,
  p_status    text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_body IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.customer_notifications (user_id, kind, status, reference, title, body)
  VALUES (p_user_id, p_kind, p_status, p_reference, p_title, p_body)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_customer] not recorded: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_customer(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ₦1,000 · ₦56,120.40 — whole naira without the kobo, as the app shows them.
CREATE OR REPLACE FUNCTION public.naira_label(p_amount numeric)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT '₦' || CASE
    WHEN p_amount IS NULL THEN '0'
    WHEN p_amount = trunc(p_amount) THEN to_char(p_amount, 'FM999,999,999,990')
    ELSE to_char(p_amount, 'FM999,999,999,990.00')
  END;
$$;

-- 08031234567 or 2348031234567 → 0803 123 4567. Anything else unchanged.
CREATE OR REPLACE FUNCTION public.phone_label(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := regexp_replace(coalesce(p_phone, ''), '^\+?234', '0');
BEGIN
  IF v ~ '^0[0-9]{10}$' THEN
    RETURN substr(v, 1, 4) || ' ' || substr(v, 5, 3) || ' ' || substr(v, 8);
  END IF;
  RETURN p_phone;
END;
$$;

/**
 * What a transaction's new state says, in the redesign's words. Null when the
 * state is not worth a notification. No table reads, so it can be checked
 * with plain SELECTs.
 */
CREATE OR REPLACE FUNCTION public.transaction_notice(
  p_status      text,
  p_service     text,     -- airtime | data | power | cable | null
  p_is_palm     boolean,
  p_name        text,     -- merchant_name: "MTN Airtime", "Lekki Fresh Mart"
  p_beneficiary text,     -- phone, meter or smartcard
  p_amount      numeric,
  p_has_token   boolean,
  p_prepaid     boolean,
  p_bank_name   text,
  p_bank_last4  text,
  OUT title text,
  OUT body  text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_amt  text := public.naira_label(p_amount);
  v_name text := coalesce(nullif(trim(p_name), ''), 'Your payment');
  v_ben  text := nullif(trim(coalesce(p_beneficiary, '')), '');
  v_bank text := CASE WHEN p_bank_name IS NOT NULL AND p_bank_last4 IS NOT NULL
                    THEN p_bank_name || ' ••' || p_bank_last4 END;
  v_noun text := CASE p_service
                 WHEN 'airtime' THEN 'airtime'
                 WHEN 'data'    THEN 'data'
                 WHEN 'power'   THEN 'electricity'
                 WHEN 'cable'   THEN 'TV subscription'
                 ELSE 'payment'
               END;
BEGIN
  IF p_status = 'delivered' THEN
    IF p_is_palm THEN
      title := 'You paid with your palm';
      body  := v_amt || ' at ' || v_name || coalesce(' from ' || v_bank, '') || '.';
    ELSIF p_service = 'power' AND p_has_token THEN
      title := 'Your electricity token is ready';
      body  := v_amt || ' ' || v_name || coalesce(' for meter ' || v_ben, '') || '. Open it to copy your token.';
    ELSIF p_service = 'airtime' THEN
      title := 'Airtime delivered';
      body  := v_amt || ' ' || v_name || coalesce(' sent to ' || public.phone_label(v_ben), '') || '.';
    ELSIF p_service = 'data' THEN
      title := 'Data delivered';
      body  := v_amt || ' ' || v_name || coalesce(' sent to ' || public.phone_label(v_ben), '') || '.';
    ELSIF p_service = 'power' THEN
      title := 'Electricity paid';
      body  := v_amt || ' ' || v_name || coalesce(' for meter ' || v_ben, '') || ' went through.';
    ELSIF p_service = 'cable' THEN
      title := 'TV subscription paid';
      body  := v_amt || ' ' || v_name || coalesce(' for smartcard ' || v_ben, '') || ' went through.';
    ELSE
      title := 'Payment delivered';
      body  := v_amt || ' ' || v_name || '.';
    END IF;

  ELSIF p_status = 'fulfilment_pending' THEN
    title := 'Confirming your ' || v_noun;
    body  := v_amt || ' to ' || v_name || ' is waiting on the provider. ' ||
             CASE WHEN p_service = 'power' AND p_prepaid
                  THEN 'Your token will appear here.'
                  ELSE 'We''ll tell you as soon as it''s through.' END;

  ELSIF p_status = 'payment_failed' THEN
    title := 'Payment failed';
    body  := v_name || ' did not go through. Nothing was charged.';

  ELSIF p_status = 'fulfilment_failed' THEN
    title := 'We couldn''t complete this';
    body  := v_name || ' could not be delivered. Your refund of ' || v_amt || ' is on its way.';

  ELSIF p_status = 'refunded' THEN
    title := 'Refund complete';
    body  := v_amt || ' for ' || v_name || ' is back in your ' ||
             coalesce(p_bank_name || ' ', 'bank ') || 'account.';

  ELSIF p_status = 'refund_failed' THEN
    title := 'Your refund is delayed';
    body  := 'We could not return ' || v_amt || ' for ' || v_name || ' automatically. Our team is on it.';

  ELSIF p_status = 'quarantined' THEN
    title := 'On hold for review';
    body  := v_amt || ' for ' || v_name || ' is being reviewed. Our team will contact you.';
  END IF;
END;
$$;

-- Internal helpers: called by the triggers below, not by the app.
REVOKE ALL ON FUNCTION public.naira_label(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phone_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transaction_notice(text, text, boolean, text, text, numeric, boolean, boolean, text, text)
  FROM PUBLIC, anon, authenticated;


-- ─── Payments and palm ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid;
  v_palm    boolean;
  v_bank    text;
  v_last4   text;
  v_notice  record;
BEGIN
  BEGIN
    v_user := NEW.user_id;
    IF v_user IS NULL AND NEW.customer_id IS NOT NULL THEN
      SELECT auth_user_id INTO v_user FROM public.customers WHERE id = NEW.customer_id;
    END IF;
    IF v_user IS NULL THEN
      RETURN NULL;
    END IF;

    -- A merchant terminal's payment is a palm payment; a bill is not.
    v_palm := NEW.merchant_id IS NOT NULL OR NEW.terminal_id IS NOT NULL;

    IF NEW.account_used IS NOT NULL THEN
      SELECT bank_name, right(account_number, 4) INTO v_bank, v_last4
        FROM public.linked_accounts WHERE id = NEW.account_used;
    END IF;

    SELECT * INTO v_notice FROM public.transaction_notice(
      NEW.status,
      NEW.service_type,
      v_palm,
      NEW.merchant_name,
      NEW.beneficiary,
      NEW.amount,
      NEW.token IS NOT NULL AND length(trim(NEW.token)) > 0,
      coalesce(NEW.variation_code, '') <> 'postpaid',
      v_bank,
      v_last4
    );

    IF v_notice.title IS NULL THEN
      RETURN NULL;
    END IF;

    PERFORM public.notify_customer(
      v_user,
      CASE WHEN v_palm THEN 'palm' ELSE 'payment' END,
      v_notice.title,
      v_notice.body,
      NEW.status,
      NEW.reference
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_transaction_change] % not recorded: %', NEW.reference, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_transaction_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transactions_notify_insert ON public.transactions;
CREATE TRIGGER transactions_notify_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_change();

DROP TRIGGER IF EXISTS transactions_notify_status ON public.transactions;
CREATE TRIGGER transactions_notify_status
  AFTER UPDATE OF status ON public.transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_transaction_change();


-- ─── Security ───────────────────────────────────────────────────────────────
-- The events a bank would tell you about. First-time set-up during onboarding
-- (the first PIN, the first password) is not news and is left out.

CREATE OR REPLACE FUNCTION public.notify_bank_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  BEGIN
    v_label := coalesce(NEW.bank_name, 'Your bank') || ' ••' || right(coalesce(NEW.account_number, ''), 4);

    IF TG_OP = 'INSERT' AND NEW.is_active THEN
      PERFORM public.notify_customer(
        NEW.user_id, 'security', 'Bank account linked',
        v_label || ' can now pay for purchases on MiliPay. If this wasn''t you, contact support now.');
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active THEN
      PERFORM public.notify_customer(
        NEW.user_id, 'security', 'Bank account removed',
        v_label || ' can no longer pay on MiliPay.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_bank_link_change] not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_bank_link_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS linked_accounts_notify_insert ON public.linked_accounts;
CREATE TRIGGER linked_accounts_notify_insert
  AFTER INSERT ON public.linked_accounts
  FOR EACH ROW EXECUTE FUNCTION public.notify_bank_link_change();

DROP TRIGGER IF EXISTS linked_accounts_notify_unlink ON public.linked_accounts;
CREATE TRIGGER linked_accounts_notify_unlink
  AFTER UPDATE OF is_active ON public.linked_accounts
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.notify_bank_link_change();


CREATE OR REPLACE FUNCTION public.notify_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer;
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_credential_change] not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_credential_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_notify_credentials ON public.customers;
CREATE TRIGGER customers_notify_credentials
  AFTER UPDATE OF pin_hash, pin_locked_until, password_changed_at ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_credential_change();
