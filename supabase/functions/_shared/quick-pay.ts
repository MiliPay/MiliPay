/**
 * Quick pay — the rules for Mono Direct Debit mandates.
 *
 * Zero imports, like vtu-state.ts: these decide whether a customer's bank is
 * debited without them looking at it, so the test suite runs exactly this.
 *
 * WHAT QUICK PAY IS. Linking a bank lets MiliPay READ an account. It does not
 * let MiliPay take money from it — only the account holder can authorise
 * that, with their bank. DirectPay asks for that authorisation on every
 * purchase, which means leaving the app each time. A mandate asks once:
 *
 *   1. the customer picks an allowance ("up to ₦50,000 over the next year")
 *   2. Mono's page opens once; they send ₦50 from that account to the NIBSS
 *      account Mono shows them, which is how the bank knows it is really them
 *   3. the bank activates it — Mono says 5 minutes to 24 hours, rarely 48+ —
 *      and tells us with events.mandates.ready
 *   4. from then on a purchase is fingerprint (or palm) and nothing else
 *
 * https://docs.mono.co/docs/payments/direct-debit/mandate-setup-explained
 *
 * Until step 3, and whenever quick pay cannot cover a purchase, the purchase
 * falls back to DirectPay. Quick pay only ever removes a step; it never
 * blocks one.
 */

export type MandateStatus = "pending" | "active" | "suspended" | "revoked" | "expired" | "rejected";

/**
 * The allowances a customer can choose from, in Naira.
 *
 * This is the TOTAL MiliPay may take under the mandate over its lifetime —
 * Mono's variable mandate `amount` is a total, not a per-debit cap. Fixed
 * choices rather than a free field: the customer's bank shows them this
 * figure when they approve, and a typo there is an awkward conversation.
 */
export const QUICK_PAY_ALLOWANCES = [20_000, 50_000, 100_000] as const;

export function isQuickPayAllowance(value: unknown): value is number {
  return typeof value === "number" && (QUICK_PAY_ALLOWANCES as readonly number[]).includes(value);
}

/** How long a mandate runs. Renewing is a new setup. */
export const QUICK_PAY_VALID_DAYS = 365;

/**
 * A setup the customer started and never finished. Mono cancels a mandate
 * whose ₦50 did not arrive within an hour, but activation after a sent ₦50
 * can itself take up to 48 hours — so this is generous on purpose.
 */
export const SETUP_ABANDONED_AFTER_HOURS = 72;

/**
 * The mandate's start and end dates, as Mono wants them: YYYY-MM-DD.
 *
 * Dated in Lagos (UTC+1, no daylight saving), because that is the calendar
 * the customer's bank uses. A mandate set up at 00:30 on the 5th in Lagos
 * starts on the 5th, not on the UTC date of the 4th.
 */
export function mandateWindow(now: Date): { startDate: string; endDate: string } {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  const start = lagos.toISOString().slice(0, 10);
  const end = new Date(lagos.getTime() + QUICK_PAY_VALID_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { startDate: start, endDate: end };
}

// ─────────────────────────────────────────────────────────────
// Webhooks: a mandate's life, separate from any payment
// ─────────────────────────────────────────────────────────────

/**
 * Whether a Mono event is about a MANDATE (created, approved, ready,
 * rejected, cancelled, paused…) rather than about money moving under one.
 *
 * The two share a prefix, and treating a lifecycle event as a payment event
 * is how a mandate being cancelled once mapped to "payment_failed" — on a
 * transaction lookup that could never match, because a mandate's reference
 * is the setup's, not a purchase's.
 */
export function isMandateLifecycleEvent(eventType: string | null | undefined): boolean {
  const value = String(eventType ?? "").trim().toLowerCase();
  if (!value.startsWith("events.mandates.") && !value.startsWith("events.mandate.")) return false;
  return !value.includes(".debit");
}

export interface MandateChange {
  to: MandateStatus;
  /** The timestamp column this event sets. */
  stamp?: "authorised_at" | "ready_at" | "revoked_at";
}

/**
 * How a lifecycle event moves a mandate. null means "leave it alone".
 *
 * Advance-only, like transactions: an event can never bring a rejected,
 * revoked or expired mandate back, because a late or replayed "ready" must
 * not turn quick pay on for an account the customer has since switched off.
 *
 * `ready` is the ONLY way into `active`, and it must say ready_to_debit —
 * Mono's approved event carries ready_to_debit:false, and debiting a mandate
 * the bank has approved but not yet activated fails at the bank.
 *
 * https://docs.mono.co/docs/payments/direct-debit/webhook-events
 */
export function mandateChangeFor(
  current: MandateStatus,
  eventType: string | null | undefined,
  data: { ready_to_debit?: unknown } = {},
): MandateChange | null {
  const event = String(eventType ?? "").trim().toLowerCase();
  const live = current === "pending" || current === "active" || current === "suspended";

  switch (event) {
    case "events.mandates.approved":
      // Approved by the bank, not yet debitable. Recorded, not acted on.
      return current === "pending" ? { to: "pending", stamp: "authorised_at" } : null;

    case "events.mandates.ready":
      if (current !== "pending") return null;
      if (data.ready_to_debit === false) return null;
      return { to: "active", stamp: "ready_at" };

    case "events.mandates.rejected":
      return current === "pending" ? { to: "rejected" } : null;

    case "events.mandate.action.cancel":
    case "events.mandates.cancelled":
      return live ? { to: "revoked", stamp: "revoked_at" } : null;

    case "events.mandates.expired":
      return live ? { to: "expired" } : null;

    case "events.mandate.action.pause":
      return current === "active" ? { to: "suspended" } : null;

    case "events.mandate.action.reinstate":
      return current === "suspended" ? { to: "active" } : null;

    default:
      // events.mandates.created and anything Mono adds later: no change.
      return null;
  }
}

/**
 * Whether the account a mandate was set up on is the one the customer chose
 * in MiliPay. Mono's events carry the account number; when they do and it
 * differs, the mandate is refused rather than attached to the wrong bank.
 * Absent on either side is not a mismatch — there is nothing to compare.
 */
export function mandateAccountMatches(
  linkedAccountNumber: string | null | undefined,
  eventAccountNumber: unknown,
): boolean {
  const ours = String(linkedAccountNumber ?? "").replace(/\D/g, "");
  const theirs = typeof eventAccountNumber === "string" ? eventAccountNumber.replace(/\D/g, "") : "";
  if (!ours || !theirs) return true;
  return ours === theirs;
}

// ─────────────────────────────────────────────────────────────
// Purchases: quick pay, or DirectPay
// ─────────────────────────────────────────────────────────────

export interface MandateForRouting {
  mono_mandate_id: string | null;
  status: string;
  max_per_debit: number | null;
  max_total: number | null;
  /** The mandate's end date. Past it, the bank refuses the debit. */
  expires_at?: string | null;
}

export type PaymentRoute =
  | { route: "mandate"; mandateId: string }
  | { route: "directpay"; reason: string };

/**
 * Which way a purchase is paid.
 *
 * Quick pay when the account has an ACTIVE mandate with room left for this
 * amount; DirectPay otherwise. Falling back is never an error — the customer
 * simply approves this one at their bank, as they would without quick pay.
 *
 * `committed` is what has already been taken, or is being taken, under this
 * mandate. It counts in-flight debits too: two purchases a second apart must
 * not both be judged against the same untouched allowance.
 */
export function choosePaymentRoute(input: {
  mandatesEnabled: boolean;
  mandate: MandateForRouting | null;
  committed: number;
  amount: number;
  now?: Date;
}): PaymentRoute {
  if (!input.mandatesEnabled) return { route: "directpay", reason: "quick pay not enabled" };

  const m = input.mandate;
  if (!m || m.status !== "active" || !m.mono_mandate_id) {
    return { route: "directpay", reason: "no active mandate" };
  }
  if (m.expires_at && new Date(m.expires_at).getTime() <= (input.now ?? new Date()).getTime()) {
    return { route: "directpay", reason: "mandate has ended" };
  }
  if (m.max_per_debit !== null && input.amount > Number(m.max_per_debit)) {
    return { route: "directpay", reason: "above the per-purchase limit" };
  }
  if (m.max_total !== null && input.committed + input.amount > Number(m.max_total)) {
    return { route: "directpay", reason: "allowance used up" };
  }
  return { route: "mandate", mandateId: m.mono_mandate_id };
}

/**
 * What has been taken, or is being taken, under a mandate, in Naira.
 *
 * Everything except a payment that never happened. A refunded purchase still
 * counts: the debit happened and Mono counts it against the mandate's total,
 * whatever MiliPay later sent back.
 */
export function committedUnderMandate(rows: { status: string; amount: unknown }[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.status === "payment_failed") continue;
    const amount = Number(row.amount);
    if (Number.isFinite(amount) && amount > 0) total += amount;
  }
  return Math.round(total * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// What the customer sees
// ─────────────────────────────────────────────────────────────

export type QuickPayState = "off" | "setting_up" | "on" | "paused" | "failed";

export interface MandateForView {
  status: string;
  created_at: string;
}

/**
 * One word for an account's quick pay, from its mandates.
 *
 * `on` beats everything: an account with a working mandate has quick pay,
 * whatever older attempts are lying around. Otherwise the most recent attempt
 * decides — a setup the customer abandoned reads as `failed` (so they are
 * offered a retry) rather than as setting up forever.
 */
export function quickPayState<T extends MandateForView>(
  mandates: T[],
  now: Date,
): { state: QuickPayState; mandate: T | null } {
  const active = mandates.find((m) => m.status === "active");
  if (active) return { state: "on", mandate: active };

  const suspended = mandates.find((m) => m.status === "suspended");
  if (suspended) return { state: "paused", mandate: suspended };

  const latest = [...mandates].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!latest) return { state: "off", mandate: null };

  if (latest.status === "pending") {
    const ageHours = (now.getTime() - new Date(latest.created_at).getTime()) / 3_600_000;
    return ageHours < SETUP_ABANDONED_AFTER_HOURS
      ? { state: "setting_up", mandate: latest }
      : { state: "failed", mandate: latest };
  }
  if (latest.status === "rejected") return { state: "failed", mandate: latest };
  return { state: "off", mandate: null };
}

/**
 * What Mono needs to know about a person before it will set up a mandate,
 * and which of it we are missing — as words a customer can act on.
 *
 * Mono's create-customer requires all six. The BVN also has to belong to the
 * person whose name is on the account, which Mono checks, not us.
 * https://docs.mono.co/docs/payments/direct-debit/integration-guide-create-customers
 */
export function missingMandateDetails(customer: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bvn?: string | null;
}): string[] {
  const blank = (v: string | null | undefined) => !String(v ?? "").trim();
  const missing: string[] = [];
  if (blank(customer.first_name)) missing.push("first name");
  if (blank(customer.last_name)) missing.push("last name");
  if (blank(customer.email)) missing.push("email address");
  if (blank(customer.phone)) missing.push("phone number");
  if (blank(customer.address)) missing.push("home address");
  if (!/^\d{11}$/.test(String(customer.bvn ?? "").trim())) missing.push("BVN");
  return missing;
}
