-- Migration: 20260921110000_merchant_control_columns.sql
-- Description:
--   A merchant could rewrite their own commercial terms.
--
--   `authenticated` held unrestricted UPDATE on public.merchants, and the
--   policy "Merchants can update own business record" let a merchant session
--   update its own row. Between them a merchant could set:
--
--     platform_fee_percent      -> 0, taking 100% of every transaction
--     status                    -> 'active', undoing their own blacklisting
--     settlement_account_number -> redirect settlements to another account
--
--   Nothing in any portal writes public.merchants from a merchant session —
--   the only three writes in the codebase are administrator actions (set
--   status, blacklist, set fee). So the policy grants nothing anyone needs and
--   is removed outright, and the three administrator writes move to a
--   role-checked definer RPC so the columns can be withheld from clients
--   entirely.

-- ─────────────────────────────────────────────────────────────
-- 1. Remove the self-update policy and the client UPDATE privilege.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Merchants can update own business record" ON public.merchants;

REVOKE UPDATE ON public.merchants FROM PUBLIC, anon, authenticated;

-- An unauthenticated session has no business writing either table. Every
-- policy on them already requires a staff_profiles row or a matching
-- auth.uid(), which anon can never satisfy, so these grants were dead weight
-- that only widened the blast radius of a future policy mistake.
REVOKE INSERT, UPDATE, DELETE ON public.merchants     FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.pos_terminals FROM PUBLIC, anon;
REVOKE SELECT                  ON public.merchants     FROM anon;
REVOKE SELECT                  ON public.pos_terminals FROM anon;
REVOKE SELECT                  ON public.transactions  FROM anon;

-- ─────────────────────────────────────────────────────────────
-- 2. Administrator controls, via a role-checked definer function.
--    Both arguments are optional so one RPC serves status changes,
--    blacklisting and fee changes without a partial write.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_merchant_controls(
  p_merchant_id UUID,
  p_status      TEXT    DEFAULT NULL,
  p_fee_percent NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.staff_profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only administrators can change merchant controls';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended', 'blacklisted', 'pending') THEN
    RAISE EXCEPTION 'Unknown merchant status: %', p_status;
  END IF;

  -- The platform fee is this business's revenue share. A negative fee would
  -- pay the merchant to transact; above 100% would take more than the sale.
  IF p_fee_percent IS NOT NULL AND (p_fee_percent < 0 OR p_fee_percent > 100) THEN
    RAISE EXCEPTION 'Platform fee must be between 0 and 100 percent';
  END IF;

  UPDATE public.merchants
     SET status               = COALESCE(p_status, status),
         platform_fee_percent = COALESCE(p_fee_percent, platform_fee_percent),
         updated_at           = NOW()
   WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found';
  END IF;

  RETURN json_build_object('success', TRUE, 'merchantId', p_merchant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_merchant_controls(UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_merchant_controls(UUID, TEXT, NUMERIC)
  TO authenticated, service_role;
