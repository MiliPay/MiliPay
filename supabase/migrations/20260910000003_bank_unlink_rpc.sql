-- 1. Grant table privileges on linked_accounts so authenticated users can update them
GRANT ALL ON public.linked_accounts TO authenticated, service_role;

-- 2. Create a secure RPC function to unlink a bank account
CREATE OR REPLACE FUNCTION public.unlink_bank_account(target_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.linked_accounts
  SET is_active = false
  WHERE id = target_account_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found or not owned by user');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_bank_account(uuid) TO authenticated;
