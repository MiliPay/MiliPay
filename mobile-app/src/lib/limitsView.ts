/**
 * The rules behind Account limits and the "Your limits" card (design handoff,
 * screen 12 and the Palm tab), apart from their pixels. Pure, so the test
 * suite runs exactly this.
 *
 * Every limit is clamped again on the server (set_transaction_limits and
 * enforceTransactionLimits), so nothing here can raise anybody's cap; this
 * only says, before the round trip, what the server would refuse.
 */

/**
 * Tier ceilings, mirrored from supabase/functions/_shared/tier-math.ts (the
 * enforcing copy) and public.tier_caps(). tests/tier-consistency.test.ts
 * fails if they ever disagree.
 */
export const TIER_CAPS: Record<number, { maxSingle: number; maxDaily: number }> = {
  1: { maxSingle: 50000, maxDaily: 200000 },
  2: { maxSingle: 150000, maxDaily: 500000 },
  3: { maxSingle: 250000, maxDaily: 1000000 },
};

export function capsFor(tier: number | null | undefined) {
  return TIER_CAPS[tier ?? 2] ?? TIER_CAPS[2];
}

/** The prototype's tier list: what each needs, and its badge on the hero. */
export const TIER_INFO: Record<number, { name: string; badge: string; needs: string; confirmed: string }> = {
  1: { name: 'Basic', badge: 'Basic', needs: 'Phone number and profile', confirmed: 'Phone number and profile confirmed' },
  2: { name: 'Biometric', badge: 'Biometric', needs: 'NIN and palm vein capture', confirmed: 'NIN and palm vein confirmed' },
  3: { name: 'Enterprise', badge: 'Enterprise', needs: 'BVN and proof of address', confirmed: 'BVN and proof of address confirmed' },
};

export type TierStatus = 'Completed' | 'Current' | 'Next step' | 'Coming soon';

/** Tier 3 is not offered yet, so it is "Coming soon" for everyone below it. */
export function tierStatus(tier: number, current: number): TierStatus {
  if (tier < current) return 'Completed';
  if (tier === current) return 'Current';
  if (tier === 3) return 'Coming soon';
  return 'Next step';
}

/** "PIN at terminals" quick picks (the prototype's pinPresets). */
export const PIN_PRESETS = [5000, 10000, 25000, 50000, 150000];

/** The PIN threshold can't be above what a single payment may be. */
export function pinCeiling(tier: number, singleLimit: number | null | undefined): number {
  const cap = capsFor(tier).maxSingle;
  return singleLimit && singleLimit > 0 ? Math.min(cap, singleLimit) : cap;
}

/** "150,000" ⇄ 150000, as the ₦ fields type them. */
export function parseAmount(text: string): number {
  return Number(String(text).replace(/[^0-9]/g, '')) || 0;
}

export function amountText(n: number): string {
  return n > 0 ? n.toLocaleString('en-NG') : '';
}

const naira0 = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

/** The prototype's saveLimits checks, in its words, or null when all is well. */
export function limitsError(single: number, daily: number, tier: number): string | null {
  const caps = capsFor(tier);
  const tierLabel = `Tier ${TIER_CAPS[tier] ? tier : 2}`;
  if (single <= 0 || daily <= 0) return 'Limits must be greater than zero.';
  if (single > caps.maxSingle) return `Per-payment limit cannot exceed your ${tierLabel} cap of ${naira0(caps.maxSingle)}.`;
  if (daily > caps.maxDaily) return `Daily limit cannot exceed your ${tierLabel} cap of ${naira0(caps.maxDaily)}.`;
  if (single > daily) return 'Per-payment limit cannot be more than your daily limit.';
  return null;
}

/** The hero's bar: "₦4,500 of ₦500,000" and "₦495,500 left today · resets at midnight". */
export function spentToday(used: number, daily: number) {
  const safeDaily = daily > 0 ? daily : 1;
  return {
    usedLabel: `${naira0(used)} of ${naira0(daily)}`,
    leftLabel: `${naira0(Math.max(0, daily - used))} left today · resets at midnight`,
    fraction: Math.max(0, Math.min(1, used / safeDaily)),
  };
}
