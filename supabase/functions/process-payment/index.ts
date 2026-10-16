import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { ApiError, adminClient, handler, requireCaller, staffRole } from "../_shared/auth.ts";
import { palmCheckout } from "../_shared/palm-checkout.ts";
import type { RecognizeMode } from "../_shared/biometrics.ts";

/**
 * Merchant POS checkout from the merchant portal.
 *
 * Flow: authenticate the terminal's merchant -> then the shared palm checkout
 * (_shared/palm-checkout.ts): match the palm -> enforce KYC tier limits and
 * the PIN challenge -> record the transaction -> return the receipt. Every
 * step fails closed. The POS terminal app reaches the same checkout through
 * the `pos` function, with its own device and cashier sign-in.
 */

interface PaymentBody {
  terminalId?: string;
  merchantId?: string;
  amount?: number;
  /** @deprecated single IR template; terminals should send irFeatures/rgbFeatures. */
  palmFeature?: string;
  irFeatures?: string;
  rgbFeatures?: string;
  recogMode?: RecognizeMode;
  /**
   * Set when the customer identified themselves first (phone, card, QR). Its
   * presence is what turns a gallery search into a single comparison.
   */
  customerHint?: string;
  /**
   * The last few digits of the customer's phone number. Narrows the gallery
   * without naming anyone, which is the difference between a 1:N search that
   * is safe at scale and one that is not.
   */
  partitionKey?: string;
  pin?: string;
  reference?: string;
  /**
   * @deprecated ignored. Which of the customer's accounts pays is the
   * customer's choice (Palm tab, "Palm payments come from"), never the
   * terminal's.
   */
  accountId?: string;
}

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();
  const body = (await req.json()) as PaymentBody;

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError("Invalid transaction amount", 400, "INVALID_AMOUNT");
  }
  // Naira, numeric(12,2): reject sub-kobo precision rather than silently rounding.
  if (Math.round(amount * 100) !== amount * 100) {
    throw new ApiError("Amount may not have more than 2 decimal places", 400, "INVALID_AMOUNT");
  }

  if (!body.merchantId) {
    throw new ApiError("Missing merchant ID", 400, "MISSING_MERCHANT");
  }

  // 1. Merchant must exist, be active, and belong to the caller.
  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("id, business_name, status, auth_user_id, platform_fee_percent, settlement_schedule")
    .eq("id", body.merchantId)
    .maybeSingle();

  if (merchantError || !merchant) {
    throw new ApiError("Merchant not found", 404, "MERCHANT_NOT_FOUND");
  }

  const callerStaffRole = await staffRole(admin, caller.id);
  const callerOwnsMerchant = merchant.auth_user_id === caller.id;
  const callerIsAdmin = callerStaffRole === "admin" || callerStaffRole === "super_admin";

  if (!callerOwnsMerchant && !callerIsAdmin) {
    // Without this check any signed-in user could bill any merchant.
    throw new ApiError("You are not authorised to collect payments for this merchant", 403, "FORBIDDEN");
  }

  if (merchant.status !== "active") {
    throw new ApiError(`Merchant account is currently ${merchant.status}`, 403, "MERCHANT_NOT_ACTIVE");
  }

  // 2. Terminal must be paired to this merchant and enabled.
  let terminal: { id: string; terminal_id: string } | null = null;
  if (body.terminalId) {
    const { data: terminalData, error: terminalError } = await admin
      .from("pos_terminals")
      .select("id, terminal_id, is_active")
      .eq("terminal_id", body.terminalId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    if (terminalError || !terminalData) {
      throw new ApiError("POS terminal is not authorised for this merchant", 403, "TERMINAL_NOT_AUTHORISED");
    }
    if (!terminalData.is_active) {
      throw new ApiError("POS terminal has been deactivated or blacklisted", 403, "TERMINAL_INACTIVE");
    }
    terminal = terminalData;
  }

  // 3. The shared checkout: idempotency, palm match, palm controls, limits
  //    and PIN, ledger write, receipt.
  return palmCheckout(admin, {
    merchant,
    terminal,
    amount,
    irFeatures: body.irFeatures ?? body.palmFeature ?? null,
    rgbFeatures: body.rgbFeatures ?? null,
    recogMode: body.recogMode,
    customerHint: body.customerHint ?? null,
    partitionKey: body.partitionKey ?? null,
    pin: body.pin,
    reference: body.reference,
  });
}));
