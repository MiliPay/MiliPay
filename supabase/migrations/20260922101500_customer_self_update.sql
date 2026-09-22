-- A customer could not change their own name, email, phone or address.
--
-- The column-level grants already say this was intended: `authenticated` holds
-- UPDATE on exactly first_name, last_name, email, phone, address and state, and
-- read-only on everything else — so kyc_tier, status, single_limit, daily_limit
-- and pin_threshold are already out of a customer's reach at the column level.
--
-- What was missing is a row policy. The only FOR UPDATE policy on the table is
-- "Admins can update customers", so a customer's own UPDATE matched no policy
-- and silently affected zero rows. PostgREST reports that as success, which is
-- why the app's profile screen could appear to save and change nothing.
--
-- The two layers do different jobs and both are needed: this policy decides
-- WHICH ROW, the existing column grants decide WHICH COLUMNS.

CREATE POLICY "Customers can update their own record"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

COMMENT ON POLICY "Customers can update their own record" ON public.customers IS
  'Row scope for a customer editing their own profile. The writable columns are fixed separately by column-level GRANTs (first_name, last_name, email, phone, address, state); everything else stays read-only to authenticated.';
