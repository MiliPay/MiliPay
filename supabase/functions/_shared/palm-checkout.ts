import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, json, loadCustomerProfile } from "./auth.ts";
import { enforceTransactionLimits } from "./limits.ts";
import { splitPayment } from "./tier-math.ts";
import { matchPalm, recordMatchEvent, type RecognizeMode } from "./biometrics.ts";

/**
 * A palm payment at a merchant, once the caller has been authorised for the
 * merchant and terminal. Shared by process-payment (merchant portal) and the
 * POS terminal's `pos` function, so both take the same money path.
 *
 * Flow: idempotency -> match the palm -> palm controls -> KYC tier limits and
 * the PIN challenge -> record the transaction -> return the receipt. Every
 * step fails closed.
 */

export interface CheckoutMerchant {
  id: string;
  business_name: string;
  platform_fee_percent: number | string | null;
  settlement_schedule: string | null;
}

export interface CheckoutInput {
  merchant: CheckoutMerchant;
  terminal: { id: string; terminal_id: string } | null;
  amount: number;
  irFeatures?: string | null;
  rgbFeatures?: string | null;
  recogMode?: RecognizeMode;
  customerHint?: string | null;
  partitionKey?: string | null;
  pin?: string;
  reference?: string;
  /** Set by the POS terminal: who took the payment and how. */
  cashierId?: string | null;
  paymentMethod?: "palm" | "qr" | "card" | null;
}

export async function palmCheckout(admin: SupabaseClient, input: CheckoutInput): Promise<Response> {
  const { merchant, terminal, amount } = input;

  // 1. Idempotency. A retried request must never double-charge.
  const reference = input.reference?.trim() ||
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

  // 2. Identify the customer by their palm. Fails closed when the sovereign
  //    matcher is unreachable or unconfigured. A customerHint narrows this to
  //    a single comparison; without one the matcher searches its gallery.
  const matchRequest = {
    irFeatures: input.irFeatures ?? null,
    rgbFeatures: input.rgbFeatures ?? null,
    // Older terminals send one IR template and nothing else, so bimodal
    // cannot be the default here the way it is at enrolment.
    recogMode: input.recogMode ?? (input.rgbFeatures ? "kBiModal" : "kRegIrVSIr"),
    customerHint: input.customerHint ?? null,
    partitionKey: input.partitionKey ?? null,
    merchantId: merchant.id,
    terminalId: terminal?.terminal_id ?? null,
  } as const;

  let match;
  try {
    match = await matchPalm(matchRequest);
  } catch (err) {
    // Record the refusal before rethrowing. A rejected scan is the datum that
    // shows a gallery drifting past its threshold, so losing it is worse than
    // losing a successful one.
    await recordMatchEvent(admin, {
      merchant_id: merchant.id,
      terminal_id: terminal?.terminal_id ?? null,
      mode: input.customerHint ? "1:1" : "1:N",
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
    merchant_id: merchant.id,
    terminal_id: terminal?.terminal_id ?? null,
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

  // 3. The customer's own palm controls (Palm tab). A paused palm is
  //    declined here, where the money moves, not just hidden in the app. If
  //    the setting can't be read, decline: a pause that fails open is no pause.
  const { data: palmSettings, error: palmError } = await admin
    .from("customers")
    .select("palm_paused")
    .eq("id", profile.id)
    .maybeSingle();
  if (palmError || !palmSettings) {
    console.error("[palm-checkout] palm settings unreadable", palmError);
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

  // 4. KYC tier caps, PIN challenge above the customer's threshold, daily cap.
  //    The terminal greets the customer by first name on its PIN screen, so a
  //    PIN prompt carries it (never the surname, never anything else).
  try {
    await enforceTransactionLimits(admin, {
      authUserId: match.authUserId,
      customerId: profile.id,
      amount,
      kycTier: profile.kycTier,
      pinThreshold: profile.pinThreshold,
      singleLimit: profile.singleLimit,
      dailyLimit: profile.dailyLimit,
      pin: input.pin,
    });
  } catch (err) {
    if (err instanceof ApiError && err.code.startsWith("PIN_")) {
      Object.assign(err.extra, { firstName: (profile.fullName ?? "").trim().split(/\s+/)[0] || null });
    }
    throw err;
  }

  // 5. Split settlement. Stored in Naira, numeric(12,2).
  //    splitPayment derives the merchant's net by subtraction rather than
  //    rounding it independently, so fee + net is always exactly the amount
  //    charged. It lives in tier-math.ts, which the test suite exercises
  //    directly, so these are the same numbers the tests assert.
  const { feeAmount, netMerchantAmount } = splitPayment(
    amount,
    Number(merchant.platform_fee_percent ?? 1.5),
  );
  const authCode = `APPR-${100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)}`;

  // 6. Record the transaction. A ledger write that fails must decline the
  //    payment: previously this was a console.warn and still returned APPROVED.
  const { error: txError } = await admin.from("transactions").insert({
    merchant_id: merchant.id,
    merchant_name: merchant.business_name,
    user_id: match.authUserId,
    customer_id: profile.id,
    account_used: (typeof palmAccountId === "string" ? palmAccountId : null),
    terminal_id: terminal?.terminal_id ?? null,
    amount,
    // MiliPay's cut, recorded on the row as quick services do, so revenue
    // can be read without re-deriving it from the merchant's current rate.
    fee_amount: feeAmount,
    // A merchant palm payment settles synchronously, so it goes straight to
    // the terminal state. 'success' was the old vocabulary; the state machine
    // in 20260922000000 constrains this column now.
    status: "delivered",
    reference,
    payment_method: input.paymentMethod ?? "palm",
    cashier_id: input.cashierId ?? null,
    used_pin: Boolean(input.pin),
    created_at: new Date().toISOString(),
  });

  if (txError) {
    console.error("[palm-checkout] ledger write failed", txError);
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
    customerFirstName: (profile.fullName ?? "").trim().split(/\s+/)[0] || null,
    usedPin: Boolean(input.pin),
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
}
