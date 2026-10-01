import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  adminClient,
  handler,
  json,
  loadCustomerProfile,
  requireCaller,
  staffRole,
} from "../_shared/auth.ts";
import { enforceTransactionLimits } from "../_shared/limits.ts";
import { splitPayment } from "../_shared/tier-math.ts";
import { matchPalm, recordMatchEvent, type RecognizeMode } from "../_shared/biometrics.ts";

/**
 * Merchant POS checkout.
 *
 * Flow: authenticate the terminal's merchant -> match the palm -> enforce KYC
 * tier limits and the PIN challenge -> record the transaction -> return the
 * receipt. Every step fails closed.
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

  // 3. Idempotency. A retried request must never double-charge.
  const reference = body.reference?.trim() ||
    `MILI-TX-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { data: existing } = await admin
    .from("transactions")
    .select("reference, amount, status, created_at")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    return json({
      success: existing.status === "success",
      status: existing.status === "delivered" ? "APPROVED" : "DECLINED",
      idempotent: true,
      reference,
      amount: Number(existing.amount),
      message: "This payment reference has already been processed.",
    });
  }

  // 4. Identify the customer by their palm. Fails closed when the sovereign
  //    matcher is unreachable or unconfigured. A customerHint narrows this to
  //    a single comparison; without one the matcher searches its gallery.
  const matchRequest = {
    irFeatures: body.irFeatures ?? body.palmFeature ?? null,
    rgbFeatures: body.rgbFeatures ?? null,
    // Older terminals send one IR template and nothing else, so bimodal
    // cannot be the default here the way it is at enrolment.
    recogMode: body.recogMode ?? (body.rgbFeatures ? "kBiModal" : "kRegIrVSIr"),
    customerHint: body.customerHint ?? null,
    partitionKey: body.partitionKey ?? null,
    merchantId: body.merchantId,
    terminalId: body.terminalId ?? null,
  } as const;

  let match;
  try {
    match = await matchPalm(matchRequest);
  } catch (err) {
    // Record the refusal before rethrowing. A rejected scan is the datum that
    // shows a gallery drifting past its threshold, so losing it is worse than
    // losing a successful one.
    await recordMatchEvent(admin, {
      merchant_id: body.merchantId,
      terminal_id: body.terminalId ?? null,
      mode: body.customerHint ? "1:1" : "1:N",
      decision:
        err instanceof ApiError && err.code === "BIOMETRIC_SERVICE_UNAVAILABLE"
          ? "error"
          : "rejected",
      error_code: err instanceof ApiError ? err.code : "UNKNOWN",
    });
    throw err;
  }

  await recordMatchEvent(admin, {
    matched_customer_id: match.customerId,
    merchant_id: body.merchantId,
    terminal_id: body.terminalId ?? null,
    mode: match.mode,
    gallery_size: match.gallerySize,
    candidates_compared: match.candidatesCompared,
    top_score: match.score,
    runner_up_score: match.runnerUpScore,
    threshold: match.threshold,
    decision: "matched",
    latency_ms: match.latencyMs,
    algorithm_version: match.algorithmVersion,
  });

  const profile = await loadCustomerProfile(admin, match.authUserId);
  if (!profile) {
    throw new ApiError("Matched customer has no active MiliPay profile", 403, "CUSTOMER_PROFILE_MISSING");
  }

  // 5. The customer's own palm controls (Palm tab). A paused palm is
  //    declined here, where the money moves, not just hidden in the app. If
  //    the setting can't be read, decline: a pause that fails open is no pause.
  const { data: palmSettings, error: palmError } = await admin
    .from("customers")
    .select("palm_paused")
    .eq("id", profile.id)
    .maybeSingle();
  if (palmError || !palmSettings) {
    console.error("[process-payment] palm settings unreadable", palmError);
    throw new ApiError("Payment could not be checked and was declined. No funds were moved.", 503, "PALM_SETTINGS_UNAVAILABLE");
  }
  if (palmSettings.palm_paused) {
    throw new ApiError(
      "This customer has paused palm payments. They can turn them back on in the MiliPay app, or pay another way.",
      403,
      "PALM_PAUSED",
    );
  }
  const { data: palmAccountId } = await admin.rpc("palm_account_for", { p_customer_id: profile.id });

  // 6. KYC tier caps, PIN challenge above the customer's threshold, daily cap.
  await enforceTransactionLimits(admin, {
    authUserId: match.authUserId,
    customerId: profile.id,
    amount,
    kycTier: profile.kycTier,
    pinThreshold: profile.pinThreshold,
    singleLimit: profile.singleLimit,
    dailyLimit: profile.dailyLimit,
    pin: body.pin,
  });

  // 7. Split settlement. Stored in Naira, numeric(12,2).
  //    splitPayment derives the merchant's net by subtraction rather than
  //    rounding it independently, so fee + net is always exactly the amount
  //    charged. It lives in tier-math.ts, which the test suite exercises
  //    directly, so these are the same numbers the tests assert.
  const { feePercent, feeAmount, netMerchantAmount } = splitPayment(
    amount,
    Number(merchant.platform_fee_percent ?? 1.5),
  );
  const authCode = `APPR-${100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)}`;

  // 8. Record the transaction. A ledger write that fails must decline the
  //    payment: previously this was a console.warn and still returned APPROVED.
  const { error: txError } = await admin.from("transactions").insert({
    merchant_id: merchant.id,
    merchant_name: merchant.business_name,
    user_id: match.authUserId,
    customer_id: profile.id,
    account_used: (typeof palmAccountId === "string" ? palmAccountId : null),
    terminal_id: terminal?.terminal_id ?? null,
    amount,
    // A merchant palm payment settles synchronously, so it goes straight to
    // the terminal state. 'success' was the old vocabulary; the state machine
    // in 20260922000000 constrains this column now.
    status: "delivered",
    reference,
    created_at: new Date().toISOString(),
  });

  if (txError) {
    console.error("[process-payment] ledger write failed", txError);
    throw new ApiError(
      "Payment could not be recorded and was declined. No funds were moved.",
      503,
      "LEDGER_WRITE_FAILED",
    );
  }

  // Heartbeat only after the money path succeeded.
  if (terminal) {
    await admin
      .from("pos_terminals")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", terminal.id);
  }

  return json({
    success: true,
    status: "APPROVED",
    authCode,
    reference,
    amount,
    platformFee: feeAmount,
    netMerchantPayout: netMerchantAmount,
    settlementSchedule: merchant.settlement_schedule ?? "instant",
    receipt: {
      merchantName: merchant.business_name,
      terminalId: terminal?.terminal_id ?? "PORTAL-DIRECT",
      amount,
      currency: "NGN",
      timestamp: new Date().toISOString(),
      status: "APPROVED",
      authCode,
      reference,
    },
  });
}));
