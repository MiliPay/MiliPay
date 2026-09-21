-- Migration: 20260921130000_role_checks_from_staff_profiles.sql
-- Description:
--   delete_customer_user and delete_staff_user authorised the caller from
--   `auth.jwt() -> 'app_metadata' ->> 'role'`. That claim is baked into the
--   access token when it is issued and is not re-read afterwards, so an
--   administrator who is demoted or suspended keeps administrator powers in
--   these two functions until their token expires — up to jwt_expiry, which is
--   3600 seconds here. Revoking someone's access should take effect at once,
--   not within the hour.
--
--   Both now resolve the role from public.staff_profiles, which is the same
--   check requireStaffRole() performs in the Edge Functions and what
--   admin_update_merchant_controls already does. staff_profiles.status is
--   honoured too: a suspended administrator is not an administrator.
--
--   Everything else these functions do is unchanged.

CREATE OR REPLACE FUNCTION public.delete_staff_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_role   TEXT;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, status INTO v_role, v_status
    FROM public.staff_profiles WHERE id = v_uid;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin')
     OR COALESCE(v_status, '') <> 'active' THEN
    RAISE EXCEPTION 'Forbidden: Only active administrators can delete staff members';
  END IF;

  IF v_uid = target_user_id THEN
    RAISE EXCEPTION 'You cannot delete your own administrator account';
  END IF;

  DELETE FROM public.staff_profiles WHERE id = target_user_id;
  DELETE FROM auth.users            WHERE id = target_user_id;

  RETURN json_build_object('success', TRUE, 'deleted_id', target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_staff_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_staff_user(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_customer_user(target_customer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_role    TEXT;
  v_status  TEXT;
  v_auth_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, status INTO v_role, v_status
    FROM public.staff_profiles WHERE id = v_uid;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin')
     OR COALESCE(v_status, '') <> 'active' THEN
    RAISE EXCEPTION 'Forbidden: Only active administrators can delete customers';
  END IF;

  -- customers.id and customers.auth_user_id are different UUIDs.
  SELECT auth_user_id INTO v_auth_id
    FROM public.customers WHERE id = target_customer_id;

  DELETE FROM public.transactions    WHERE customer_id = target_customer_id;
  DELETE FROM public.linked_accounts WHERE customer_id = target_customer_id;
  DELETE FROM public.customers       WHERE id = target_customer_id;

  IF v_auth_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_id;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'deleted_id', target_customer_id,
    'deleted_auth_id', v_auth_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_customer_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_user(UUID) TO authenticated, service_role;
