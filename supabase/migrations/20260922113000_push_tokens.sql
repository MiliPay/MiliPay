-- Where to reach a customer's devices.
--
-- One row per device, not per customer: people replace phones, and a customer
-- signed in on two devices should hear about a payment on both. The token is
-- the device's address with Expo's push service, not a secret — but it is
-- still a way to reach a specific person's phone, so a customer may only ever
-- see and write their own.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  -- ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
  token         text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  -- Set when Expo tells us the token is dead (DeviceNotRegistered), so a
  -- reinstalled or wiped phone stops being retried forever.
  revoked_at    timestamptz
);

-- The same device re-registering must update its row, not add another. Expo
-- issues one token per installation, so the token itself is the identity.
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_key ON public.push_tokens (token);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS push_tokens_customer_idx ON public.push_tokens (customer_id) WHERE revoked_at IS NULL;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.push_tokens TO authenticated;

CREATE POLICY "Customers manage their own device tokens"
  ON public.push_tokens
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.push_tokens IS
  'Expo push tokens, one row per device. Written by the mobile app for the signed-in user only; read by the service role when a transaction changes state.';
