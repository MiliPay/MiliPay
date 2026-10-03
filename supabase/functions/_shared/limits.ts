import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError } from "./auth.ts";
import { effectiveLimits, tierFor } from "./tier-math.ts";

// The tier table and the clamping arithmetic live in tier-math.ts, which has
// no imports so the test suite can exercise the exact code that enforces a
// payment rather than a copy of it. Re-exported here so existing importers of
// this module keep working.
export { TIER_LIMITS, tierFor, effectiveLimits } from "./tier-math.ts";
export type { TierLimit } from "./tier-math.ts";

const naira = (n: number) => "₦" + n.toLocaleString("en-NG");

/**
 * Enforce single-transaction cap, PIN challenge and cumulative daily cap.
 *
 * Throws ApiError on every rejection so a caller can never accidentally
 * continue past a failed check.
 */
export async function enforceTransactionLimits(
  admin: SupabaseClient,
  opts: {
    authUserId: string;
    customerId: string;
    amount: number;
    kycTier: number;
    pinThreshold: number;
    /** Customer's own caps. null means "use the tier default". */
    singleLimit?: number | null;
    dailyLimit?: number | null;
    pin?: string;
  },
): Promise<void> {
  const { authUserId, customerId, amount, kycTier, pinThreshold, pin } = opts;
  // The ceilings are edited in Settings › Tier limits (public.tier_limits).
  // If they can't be read the payment stops: guessing could mean allowing
  // more than an administrator has just set.
  const { data: capRows, error: capError } = await admin.rpc("tier_caps", { p_tier: kycTier });
  const cap = Array.isArray(capRows) ? capRows[0] : capRows;
  if (capError || !cap || !(Number(cap.max_single) > 0) || !(Number(cap.max_daily) > 0)) {
    console.error("[limits] tier_caps failed", capError);
    throw new ApiError("Could not check your limits. Please try again.", 503, "LIMIT_CHECK_UNAVAILABLE");
  }
  const caps = { maxSingle: Number(cap.max_single), maxDaily: Number(cap.max_daily) };
  const tier = { ...tierFor(kycTier), ...caps };
  const limits = effectiveLimits(kycTier, opts.singleLimit, opts.dailyLimit, caps);

  if (amount > limits.maxSingle) {
    const isCustomerSet = limits.singleIsCustomerSet;
    throw new ApiError(
      isCustomerSet
        ? `Transaction of ${naira(amount)} exceeds the ${naira(limits.maxSingle)} per-transaction limit you set. Raise it in the app to continue.`
        : `Transaction of ${naira(amount)} exceeds your ${tier.name} limit of ${naira(limits.maxSingle)} per transaction.`,
      400,
      "EXCEEDS_SINGLE_LIMIT",
      { maxSingle: limits.maxSingle, tierMaxSingle: tier.maxSingle, tier: kycTier, customerSet: isCustomerSet },
    );
  }

  // PIN challenge above the customer's configured threshold.
  if (amount > pinThreshold) {
    if (!pin) {
      throw new ApiError(
        `Transactions above ${naira(pinThreshold)} require your 4-digit MiliPay PIN.`,
        401,
        "PIN_REQUIRED",
        { requirePin: true, threshold: pinThreshold },
      );
    }

    const { data: result, error } = await admin.rpc("verify_customer_pin", {
      p_user_id: authUserId,
      p_pin: String(pin),
    });

    if (error) {
      console.error("[limits] verify_customer_pin failed", error);
      throw new ApiError("Could not verify your PIN. Please try again.", 503, "PIN_VERIFY_UNAVAILABLE");
    }

    if (!result?.valid) {
      const code = result?.code ?? "PIN_INCORRECT";
      const message = code === "PIN_LOCKED"
        ? "Too many incorrect PIN attempts. Your PIN is locked for 15 minutes."
        : code === "PIN_NOT_SET"
        ? "No PIN is set on this account. Set your MiliPay PIN before making this payment."
        : `Incorrect PIN. ${result?.attemptsRemaining ?? 0} attempt(s) remaining.`;

      throw new ApiError(message, 401, code, {
        requirePin: code !== "PIN_LOCKED",
        attemptsRemaining: result?.attemptsRemaining,
      });
    }
  }

  // Cumulative daily cap, reset at 00:00 WAT.
  const { data: spent, error: spendError } = await admin.rpc("get_customer_daily_spend", {
    p_user_id: customerId,
  });

  if (spendError) {
    console.error("[limits] get_customer_daily_spend failed", spendError);
    throw new ApiError("Could not verify your daily limit. Please try again.", 503, "LIMIT_CHECK_UNAVAILABLE");
  }

  const spentToday = Number(spent ?? 0);
  if (spentToday + amount > limits.maxDaily) {
    const remaining = Math.max(0, limits.maxDaily - spentToday);
    const isCustomerSet = limits.dailyIsCustomerSet;
    throw new ApiError(
      `Daily limit of ${naira(limits.maxDaily)} reached${isCustomerSet ? " (limit you set)" : ` for ${tier.name}`}. ` +
        `Remaining today: ${naira(remaining)}. Resets at 00:00 WAT.`,
      400,
      "EXCEEDS_DAILY_LIMIT",
      {
        dailySpent: spentToday,
        maxDaily: limits.maxDaily,
        tierMaxDaily: tier.maxDaily,
        remainingLimit: remaining,
        tier: kycTier,
        customerSet: isCustomerSet,
      },
    );
  }
}
