import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError } from "./auth.ts";

export interface TierLimit {
  tier: number;
  name: string;
  maxSingle: number;
  maxDaily: number;
}

/** CBN-aligned KYC tiers. Mirrors TIER_LIMITS in packages/shared/src/types. */
export const TIER_LIMITS: Record<number, TierLimit> = {
  1: { tier: 1, name: "Tier 1", maxSingle: 50_000, maxDaily: 200_000 },
  2: { tier: 2, name: "Tier 2", maxSingle: 150_000, maxDaily: 500_000 },
  3: { tier: 3, name: "Tier 3", maxSingle: 250_000, maxDaily: 1_000_000 },
};

export function tierFor(kycTier: number): TierLimit {
  return TIER_LIMITS[kycTier] ?? TIER_LIMITS[2];
}

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
  const tier = tierFor(kycTier);

  // A customer may tighten their own limits but never loosen them, so the
  // effective cap is whichever is lower. set_transaction_limits already clamps
  // on write; taking the minimum again here means a stale or hand-edited row
  // still cannot raise a cap above the tier.
  const limits = {
    ...tier,
    maxSingle: Math.min(tier.maxSingle, opts.singleLimit ?? tier.maxSingle),
    maxDaily: Math.min(tier.maxDaily, opts.dailyLimit ?? tier.maxDaily),
  };

  if (amount > limits.maxSingle) {
    const isCustomerSet = limits.maxSingle < tier.maxSingle;
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
    const isCustomerSet = limits.maxDaily < tier.maxDaily;
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
