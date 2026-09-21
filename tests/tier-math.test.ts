import { describe, expect, it } from "vitest";
import {
  TIER_LIMITS,
  effectiveLimits,
  splitPayment,
  tierFor,
} from "../supabase/functions/_shared/tier-math";

/**
 * These import the exact module the Edge Functions run, not a copy, so a
 * passing test here is a statement about what actually enforces a payment.
 */

describe("tierFor", () => {
  it("returns the matching tier", () => {
    expect(tierFor(1).maxSingle).toBe(50_000);
    expect(tierFor(2).maxSingle).toBe(150_000);
    expect(tierFor(3).maxSingle).toBe(250_000);
  });

  it("falls back to Tier 2 for an unknown tier rather than to no limit", () => {
    // A customer row with a corrupt or future kyc_tier must not end up
    // uncapped. Tier 2 is the enrolled default.
    expect(tierFor(0)).toEqual(TIER_LIMITS[2]);
    expect(tierFor(99)).toEqual(TIER_LIMITS[2]);
    expect(tierFor(Number.NaN)).toEqual(TIER_LIMITS[2]);
  });
});

describe("effectiveLimits", () => {
  it("uses the tier when the customer has set nothing", () => {
    const limits = effectiveLimits(2, null, null);
    expect(limits.maxSingle).toBe(150_000);
    expect(limits.maxDaily).toBe(500_000);
    expect(limits.singleIsCustomerSet).toBe(false);
    expect(limits.dailyIsCustomerSet).toBe(false);
  });

  it("lets a customer tighten their own limits", () => {
    const limits = effectiveLimits(2, 20_000, 100_000);
    expect(limits.maxSingle).toBe(20_000);
    expect(limits.maxDaily).toBe(100_000);
    expect(limits.singleIsCustomerSet).toBe(true);
    expect(limits.dailyIsCustomerSet).toBe(true);
  });

  it("refuses to let a customer raise a limit above their tier", () => {
    // The whole point of the second clamp: set_transaction_limits already
    // bounds this on write, so a row holding a larger number means that RPC
    // was bypassed or broken. It must still not take effect.
    const limits = effectiveLimits(2, 900_000, 5_000_000);
    expect(limits.maxSingle).toBe(150_000);
    expect(limits.maxDaily).toBe(500_000);
    expect(limits.singleIsCustomerSet).toBe(false);
  });

  it("ignores zero, negative and non-finite limits instead of locking the account", () => {
    // A 0 limit would decline every payment; treat it as unset.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const limits = effectiveLimits(2, bad, bad);
      expect(limits.maxSingle).toBe(150_000);
      expect(limits.maxDaily).toBe(500_000);
    }
  });

  it("clamps an unknown tier to Tier 2 before applying customer limits", () => {
    expect(effectiveLimits(42, 900_000, null).maxSingle).toBe(150_000);
  });
});

describe("splitPayment", () => {
  it("splits at the merchant's fee", () => {
    const split = splitPayment(10_000, 1.5);
    expect(split.feeAmount).toBe(150);
    expect(split.netMerchantAmount).toBe(9_850);
  });

  it("always adds back up to the amount charged", () => {
    // A split that loses or invents a kobo becomes a reconciliation problem at
    // scale, so this is the property that actually matters.
    const amounts = [1, 3.33, 99.99, 100, 1_234.56, 10_000, 149_999.99];
    const percents = [0, 0.5, 1.5, 2.75, 3, 7.125, 100];

    for (const amount of amounts) {
      for (const percent of percents) {
        const split = splitPayment(amount, percent);
        expect(split.feeAmount + split.netMerchantAmount).toBeCloseTo(amount, 10);
      }
    }
  });

  it("never produces sub-kobo precision", () => {
    const split = splitPayment(3.33, 7.125);
    expect(Math.round(split.feeAmount * 100)).toBe(split.feeAmount * 100);
    expect(Math.round(split.netMerchantAmount * 100)).toBe(split.netMerchantAmount * 100);
  });

  it("takes nothing at a zero fee and everything at 100%", () => {
    expect(splitPayment(500, 0)).toMatchObject({ feeAmount: 0, netMerchantAmount: 500 });
    expect(splitPayment(500, 100)).toMatchObject({ feeAmount: 500, netMerchantAmount: 0 });
  });

  it("falls back to 1.5% for a nonsensical fee rather than paying the merchant to transact", () => {
    for (const bad of [-5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      const split = splitPayment(10_000, bad);
      expect(split.feePercent).toBe(1.5);
      expect(split.feeAmount).toBe(150);
    }
  });
});
