/**
 * Tier limits and money arithmetic. Pure, with no imports.
 *
 * Kept free of dependencies on purpose. Deno runs it inside the Edge
 * Functions, and the test suite imports the very same file — so the numbers
 * the tests assert are the numbers that enforce a payment, not a copy of them.
 *
 * There are three other places these figures appear and none of them can
 * import this file: public.tier_caps() in SQL, TIER_LIMITS in
 * packages/shared/src/types (Vite), and TIER_CAPS in the Expo app, which is a
 * separate package. tests/tier-consistency.test.ts reads all four and fails if
 * they ever disagree.
 *
 * All amounts are Naira, numeric(12,2). Never kobo.
 */

export interface TierLimit {
  tier: number;
  name: string;
  maxSingle: number;
  maxDaily: number;
}

/** CBN-aligned KYC tiers. */
export const TIER_LIMITS: Record<number, TierLimit> = {
  1: { tier: 1, name: "Tier 1", maxSingle: 50_000, maxDaily: 200_000 },
  2: { tier: 2, name: "Tier 2", maxSingle: 150_000, maxDaily: 500_000 },
  3: { tier: 3, name: "Tier 3", maxSingle: 250_000, maxDaily: 1_000_000 },
};

/** Unknown tiers fall back to Tier 2 rather than to no limit at all. */
export function tierFor(kycTier: number): TierLimit {
  return TIER_LIMITS[kycTier] ?? TIER_LIMITS[2];
}

export interface EffectiveLimits {
  maxSingle: number;
  maxDaily: number;
  /** True when the customer's own setting, not the tier, is the binding cap. */
  singleIsCustomerSet: boolean;
  dailyIsCustomerSet: boolean;
}

/**
 * A customer may tighten their own limits but never loosen them, so the
 * effective cap is whichever is lower.
 *
 * set_transaction_limits already clamps on write; taking the minimum again
 * here means a stale row, a hand-edited one, or a future bug in that RPC still
 * cannot raise a cap above the tier.
 */
export function effectiveLimits(
  kycTier: number,
  singleLimit?: number | null,
  dailyLimit?: number | null,
): EffectiveLimits {
  const tier = tierFor(kycTier);

  // A non-finite or non-positive value is not a tightening, it is nonsense;
  // ignore it and use the tier.
  const usable = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

  const single = usable(singleLimit);
  const daily = usable(dailyLimit);

  const maxSingle = single === null ? tier.maxSingle : Math.min(tier.maxSingle, single);
  const maxDaily = daily === null ? tier.maxDaily : Math.min(tier.maxDaily, daily);

  return {
    maxSingle,
    maxDaily,
    singleIsCustomerSet: maxSingle < tier.maxSingle,
    dailyIsCustomerSet: maxDaily < tier.maxDaily,
  };
}

export interface PaymentSplit {
  amount: number;
  feePercent: number;
  feeAmount: number;
  netMerchantAmount: number;
}

/**
 * Split a payment into the platform fee and the merchant's net.
 *
 * Rounded to kobo precision (two decimal places) at each step so that
 * feeAmount + netMerchantAmount is exactly amount — a split that loses or
 * invents a kobo turns into a reconciliation problem at scale.
 */
export function splitPayment(amount: number, feePercent: number): PaymentSplit {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const safePercent = Number.isFinite(feePercent) && feePercent >= 0 && feePercent <= 100
    ? feePercent
    : 1.5;

  const feeAmount = round2(amount * (safePercent / 100));
  // Derived by subtraction rather than rounded independently, so the two parts
  // always add back up to the amount charged.
  const netMerchantAmount = round2(amount - feeAmount);

  return { amount: round2(amount), feePercent: safePercent, feeAmount, netMerchantAmount };
}
