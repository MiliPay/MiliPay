-- The unlinked-bank notice in the redesign's own words (the prototype's
-- unlinkConfirm): "GTBank unlinked" / "GTBank ••6789 can no longer be used
-- for payments on MiliPay." Otherwise unchanged from 20260927120000.

CREATE OR REPLACE FUNCTION public.notify_bank_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank  text;
  v_label text;
BEGIN
  BEGIN
    v_bank  := coalesce(NEW.bank_name, 'Your bank');
    v_label := v_bank || ' ••' || right(coalesce(NEW.account_number, ''), 4);

    IF TG_OP = 'INSERT' AND NEW.is_active THEN
      PERFORM public.notify_customer(
        NEW.user_id, 'security', 'Bank account linked',
        v_label || ' can now pay for purchases on MiliPay. If this wasn''t you, contact support now.');
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active THEN
      PERFORM public.notify_customer(
        NEW.user_id, 'security', v_bank || ' unlinked',
        v_label || ' can no longer be used for payments on MiliPay.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_bank_link_change] not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_bank_link_change() FROM PUBLIC, anon, authenticated;
