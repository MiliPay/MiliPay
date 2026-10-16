/**
 * The POS terminal's rules (merchant-portal/design_handoff_pos), apart from
 * the plumbing. Pure, with no imports, so the `pos` Edge Function, the
 * terminal app and the test suite all run exactly this.
 */

export type PayMethod = "palm" | "qr" | "card";

/** Wrong cashier PINs before the cashier is locked out, and for how long. */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

/** How long the cashier session from a PIN unlock lasts (one shift). */
export const CASHIER_SESSION_HOURS = 12;
/** How long the first-login grant to set the owner's PIN lasts. */
export const SETUP_GRANT_MINUTES = 10;

export const PIN_RE = /^\d{4}$/;

/**
 * The result screens the design defines, keyed by the error codes
 * process-payment's checkout already throws.
 *   pin           amount is above the customer's palm-only limit: ask for their PIN
 *   pin-wrong     their PIN was wrong; try again
 *   pin-locked    too many wrong PINs on their account
 *   paused        they paused palm payments in the app
 *   not-recognised  no confident match
 *   limit         over a per-payment or daily limit
 *   unavailable   anything that means "couldn't check": no money moved
 */
export type PosOutcome = "pin" | "pin-wrong" | "pin-locked" | "paused" | "not-recognised" | "limit" | "unavailable";

const OUTCOMES: Record<string, PosOutcome> = {
  PIN_REQUIRED: "pin",
  PIN_INCORRECT: "pin-wrong",
  PIN_LOCKED: "pin-locked",
  PIN_NOT_SET: "unavailable",
  PALM_PAUSED: "paused",
  PALM_NOT_RECOGNISED: "not-recognised",
  PALM_MATCH_AMBIGUOUS: "not-recognised",
  PALM_MATCH_LOW_CONFIDENCE: "not-recognised",
  PALM_FEATURE_REQUIRED: "not-recognised",
  PALM_FEATURE_INCOMPLETE: "not-recognised",
  EXCEEDS_SINGLE_LIMIT: "limit",
  EXCEEDS_DAILY_LIMIT: "limit",
};

export function posOutcome(code: string | undefined | null): PosOutcome {
  return (code && OUTCOMES[code]) || "unavailable";
}

/** "Tunde Adebayo" → "TA"; one name → its first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

/** Whether a cashier can try a PIN now, and the state after a wrong one. */
export function pinLocked(lockedUntil: string | null, now: Date): boolean {
  return !!lockedUntil && new Date(lockedUntil).getTime() > now.getTime();
}

export function afterWrongPin(failedAttempts: number, now: Date): { failedAttempts: number; lockedUntil: string | null } {
  const n = failedAttempts + 1;
  return n >= MAX_PIN_ATTEMPTS
    ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000).toISOString() }
    : { failedAttempts: n, lockedUntil: null };
}

// ── End of day ─────────────────────────────────────────────────────────────

export interface DayTx {
  amount: number;
  fee: number;
  method: PayMethod | null;
  status: string;
}

export interface DaySummary {
  count: number;
  gross: number;
  refunds: number;
  fees: number;
  net: number;
  palmShare: number;
  mix: { method: PayMethod; count: number; amount: number; share: number }[];
}

/** Money is naira with kobo; sums are rounded to the kobo so they add up on paper. */
const kobo = (n: number) => Math.round(n * 100) / 100;

/**
 * A delivered payment counts toward the day. A refund request takes the
 * payment out of the totals and shows it under refunds, as the design does.
 */
export function daySummary(rows: DayTx[]): DaySummary {
  const paid = rows.filter((r) => r.status === "delivered");
  const refunded = rows.filter((r) => r.status === "refund_pending" || r.status === "refunded");
  const gross = kobo(paid.reduce((a, r) => a + r.amount, 0));
  const fees = kobo(paid.reduce((a, r) => a + r.fee, 0));
  const methods: PayMethod[] = ["palm", "qr", "card"];
  const mix = methods.map((method) => {
    const list = paid.filter((r) => (r.method ?? "palm") === method);
    const amount = kobo(list.reduce((a, r) => a + r.amount, 0));
    return { method, count: list.length, amount, share: gross ? amount / gross : 0 };
  });
  return {
    count: paid.length,
    gross,
    refunds: kobo(refunded.reduce((a, r) => a + r.amount, 0)),
    fees,
    net: kobo(gross - fees),
    palmShare: paid.length ? mix[0].count / paid.length : 0,
    mix,
  };
}

/** What the terminal shows for a transaction's status. */
export function posStatus(status: string): "Paid" | "Refund requested" | "Refunded" | "Not paid" {
  if (status === "delivered") return "Paid";
  if (status === "refund_pending") return "Refund requested";
  if (status === "refunded") return "Refunded";
  return "Not paid";
}
