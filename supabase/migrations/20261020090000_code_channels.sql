-- One-time codes by SMS, call, email or WhatsApp (the customer picks).
--
-- Email codes go only to an address the customer has proved is theirs, by
-- the code Me › Contact details sends to it. That proof lives here.
-- Whatever else changes the email (an admin edit, a script) clears it, so a
-- code can never go to an inbox nobody proved.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.customers_email_unverify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email_verified_at IS NOT DISTINCT FROM OLD.email_verified_at THEN
    NEW.email_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.customers_email_unverify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_email_unverify ON public.customers;
CREATE TRIGGER customers_email_unverify
  BEFORE UPDATE OF email ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_email_unverify();
