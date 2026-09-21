import { describe, expect, it } from "vitest";
import {
  MoneyError,
  isStorableNaira,
  koboToNaira,
  nairaToKobo,
  roundNaira,
} from "../supabase/functions/_shared/money";

/**
 * The one conversion that, if wrong, charges a customer 100x. Mono speaks
 * kobo; the MiliPay ledger is Naira numeric(12,2) and never kobo.
 */

describe("nairaToKobo", () => {
  it("converts whole and fractional Naira", () => {
    expect(nairaToKobo(1000)).toBe(100_000);
    expect(nairaToKobo(0)).toBe(0);
    expect(nairaToKobo(50)).toBe(5_000);
    expect(nairaToKobo(1025.5)).toBe(102_550);
    expect(nairaToKobo(0.01)).toBe(1);
  });

  it("survives float representation noise", () => {
    // 10.07 * 100 is 1006.9999999999999 in IEEE 754.
    expect(nairaToKobo(10.07)).toBe(1007);
    expect(nairaToKobo(1.1)).toBe(110);
    expect(nairaToKobo(2.9)).toBe(290);
    expect(nairaToKobo(1234.56)).toBe(123_456);
  });

  it("rejects sub-kobo precision instead of rounding it away", () => {
    // If a caller produced 10.005 the bug is upstream; rounding here hides it.
    expect(() => nairaToKobo(10.005)).toThrow(MoneyError);
    expect(() => nairaToKobo(0.001)).toThrow(MoneyError);
  });

  it("rejects negatives, infinities and non-numbers", () => {
    expect(() => nairaToKobo(-1)).toThrow(MoneyError);
    expect(() => nairaToKobo(Number.NaN)).toThrow(MoneyError);
    expect(() => nairaToKobo(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => nairaToKobo("1000" as unknown as number)).toThrow(MoneyError);
    expect(() => nairaToKobo(undefined as unknown as number)).toThrow(MoneyError);
  });

  it("rejects an amount beyond what the column can hold", () => {
    expect(() => nairaToKobo(1e12)).toThrow(MoneyError);
  });
});

describe("koboToNaira", () => {
  it("converts provider amounts back to Naira", () => {
    expect(koboToNaira(100_000)).toBe(1000);
    expect(koboToNaira(1)).toBe(0.01);
    expect(koboToNaira(0)).toBe(0);
    expect(koboToNaira(102_550)).toBe(1025.5);
  });

  it("accepts a numeric string, because providers send them", () => {
    expect(koboToNaira("100000")).toBe(1000);
    expect(koboToNaira(" 5000 ")).toBe(50);
  });

  it("throws rather than returning zero for junk", () => {
    // A silent zero here would look like a successful 0 naira payment.
    expect(() => koboToNaira(null)).toThrow(MoneyError);
    expect(() => koboToNaira(undefined)).toThrow(MoneyError);
    expect(() => koboToNaira("abc")).toThrow(MoneyError);
    expect(() => koboToNaira(Number.NaN)).toThrow(MoneyError);
  });

  it("rejects a fractional kobo amount", () => {
    expect(() => koboToNaira(100.5)).toThrow(MoneyError);
  });

  it("round-trips every amount it accepts", () => {
    for (const naira of [0, 0.01, 50, 1000, 1025.5, 9999.99, 250_000]) {
      expect(koboToNaira(nairaToKobo(naira)), String(naira)).toBe(naira);
    }
  });
});

describe("roundNaira", () => {
  it("rounds to the precision numeric(12,2) actually holds", () => {
    expect(roundNaira(10.005)).toBe(10.01);
    expect(roundNaira(1000 * 0.015)).toBe(15);
    expect(roundNaira(33.333333)).toBe(33.33);
  });

  it("throws on a non-finite input rather than producing NaN", () => {
    expect(() => roundNaira(Number.NaN)).toThrow(MoneyError);
  });
});

describe("isStorableNaira", () => {
  it("accepts what the column can hold", () => {
    expect(isStorableNaira(1000)).toBe(true);
    expect(isStorableNaira(10.07)).toBe(true);
    expect(isStorableNaira(0)).toBe(true);
  });

  it("rejects everything else without throwing", () => {
    expect(isStorableNaira(10.005)).toBe(false);
    expect(isStorableNaira(-1)).toBe(false);
    expect(isStorableNaira("1000")).toBe(false);
    expect(isStorableNaira(null)).toBe(false);
    expect(isStorableNaira(Number.NaN)).toBe(false);
  });
});
