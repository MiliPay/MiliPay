/**
 * The Naira/kobo boundary.
 *
 * Zero imports so the tests run it directly.
 *
 * GEMINI.md is unambiguous: MiliPay stores Naira as numeric(12,2) and never
 * kobo. But Mono speaks kobo, and so do most Nigerian payment APIs. That makes
 * every call to them a place where a factor of 100 can go missing — in the
 * direction that charges a customer ₦100,000 for ₦1,000 of airtime.
 *
 * So the conversion happens here, in two functions, with tests, and nowhere
 * else. If you find yourself writing `* 100` near a provider call, use these
 * instead.
 */

/** Largest amount we will convert. numeric(12,2) tops out below this. */
const MAX_NAIRA = 9_999_999_999;

export class MoneyError extends Error {}

/**
 * Naira -> kobo, for sending to a provider.
 *
 * Rejects anything that is not a clean kobo amount rather than rounding it
 * silently: if a caller has produced ₦10.005, the bug is upstream and
 * rounding it here hides it.
 */
export function nairaToKobo(naira: number): number {
  if (typeof naira !== "number" || !Number.isFinite(naira)) {
    throw new MoneyError("Amount is not a finite number");
  }
  if (naira < 0) throw new MoneyError("Amount may not be negative");
  if (naira > MAX_NAIRA) throw new MoneyError("Amount is out of range");

  const kobo = naira * 100;
  // Float noise: 10.07 * 100 is 1006.9999999999999, which must become 1007,
  // while a genuine 10.005 must be rejected.
  const rounded = Math.round(kobo);
  if (Math.abs(kobo - rounded) > 1e-6) {
    throw new MoneyError("Amount has sub-kobo precision");
  }
  return rounded;
}

/**
 * kobo -> Naira, for anything arriving from a provider.
 *
 * Providers occasionally send the value as a string. That is accepted, because
 * refusing it would reject a real payment, but anything genuinely unparseable
 * is an error rather than a silent zero — a zero here would look like a
 * successful ₦0 payment.
 */
export function koboToNaira(kobo: number | string | null | undefined): number {
  const value = typeof kobo === "string" ? Number(kobo.trim()) : kobo;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MoneyError("Provider amount is not a number");
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError("Provider amount is not a whole number of kobo");
  }
  // Two decimal places exactly, matching numeric(12,2).
  return Math.round(value) / 100;
}

/** Rounds a computed Naira figure to the precision the column actually holds. */
export function roundNaira(naira: number): number {
  if (typeof naira !== "number" || !Number.isFinite(naira)) {
    throw new MoneyError("Amount is not a finite number");
  }
  return Math.round(naira * 100) / 100;
}

/** True when a value is storable in numeric(12,2) without loss. */
export function isStorableNaira(naira: unknown): naira is number {
  return (
    typeof naira === "number" &&
    Number.isFinite(naira) &&
    naira >= 0 &&
    naira <= MAX_NAIRA &&
    Math.abs(naira * 100 - Math.round(naira * 100)) <= 1e-6
  );
}
