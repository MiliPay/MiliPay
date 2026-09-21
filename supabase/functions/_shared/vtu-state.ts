/**
 * The quick-services transaction state machine.
 *
 * Zero imports, like tier-math.ts, match-math.ts and environment.ts: this
 * decides whether a customer's money is taken, kept, or given back, so the
 * Node test suite has to be able to run exactly this code.
 *
 * The one invariant everything else serves:
 *
 *   IRREVERSIBLE VALUE IS NEVER DISPENSED BEFORE THE MONEY IS CONFIRMED.
 *
 * Airtime cannot be un-sold. So `fulfilling` is only ever reachable from
 * `paid`, and `paid` is only ever reachable from a verified Mono webhook.
 * There is deliberately no edge from `initiated` to `fulfilling`.
 */

export type TransactionStatus =
  | "initiated"
  | "payment_failed"
  | "paid"
  | "fulfilling"
  | "fulfilment_pending"
  | "delivered"
  | "fulfilment_failed"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "quarantined";

/** Nothing leaves these except by a human. */
export const TERMINAL_STATES: readonly TransactionStatus[] = [
  "payment_failed",
  "delivered",
  "refunded",
  "refund_failed",
  "quarantined",
] as const;

/**
 * States where we are holding the customer's money without having delivered
 * anything. The reconciliation job exists for exactly this set.
 */
export const UNSETTLED_STATES: readonly TransactionStatus[] = [
  "initiated",
  "paid",
  "fulfilling",
  "fulfilment_pending",
  "refund_pending",
] as const;

const TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  // Money has not moved yet. Either the bank pays or it does not.
  initiated: ["paid", "payment_failed", "quarantined"],

  // The bank paid. Now — and only now — may we spend our own money.
  paid: ["fulfilling", "refund_pending", "quarantined"],

  fulfilling: ["delivered", "fulfilment_pending", "fulfilment_failed"],

  // The operator has neither confirmed nor refused. Requery until it does.
  fulfilment_pending: ["delivered", "fulfilment_failed", "fulfilment_pending"],

  // We took the money and could not deliver. The only honest exit is a refund.
  fulfilment_failed: ["refund_pending"],

  refund_pending: ["refunded", "refund_failed", "refund_pending"],

  payment_failed: [],
  delivered: [],
  refunded: [],
  refund_failed: ["refund_pending"], // a human can put it back in the queue
  quarantined: ["refund_pending", "delivered"], // resolved by a human either way
};

export function isTerminal(status: TransactionStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

/**
 * A no-op transition (from === to) is allowed only where the machine lists it,
 * because a requery that finds nothing new must be able to say so without
 * being treated as an error.
 */
export function assertTransition(
  from: TransactionStatus,
  to: TransactionStatus,
): TransitionResult {
  if (canTransition(from, to)) return { ok: true };
  return {
    ok: false,
    reason: isTerminal(from)
      ? `${from} is terminal; refusing to move it to ${to}`
      : `${from} -> ${to} is not a legal transition`,
  };
}

// ─────────────────────────────────────────────────────────────
// Provider responses -> state
// ─────────────────────────────────────────────────────────────

/**
 * VTPass response codes.
 *
 *   000  delivered
 *   001  transaction processing - pending
 *   099  transaction is processing
 *
 * The old code treated 099 as a final success: the customer was charged, the
 * row was written 'success', and if VTPass later failed the transaction nobody
 * ever found out. Anything that is not an explicit 000 is now pending or
 * failed, never success.
 */
export function statusForVtpassCode(code: string | undefined | null): TransactionStatus {
  const value = String(code ?? "").trim();
  if (value === "000") return "delivered";
  if (value === "099" || value === "001") return "fulfilment_pending";
  return "fulfilment_failed";
}

/**
 * VTPass requery reports the settled outcome in
 * content.transactions.status. 'reversed' means VTPass refunded our wallet,
 * so the customer must be refunded too.
 */
export function statusForVtpassTransactionStatus(
  status: string | undefined | null,
): TransactionStatus {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "delivered":
    case "successful":
    case "success":
      return "delivered";
    case "pending":
    case "initiated":
    case "processing":
      return "fulfilment_pending";
    default:
      return "fulfilment_failed";
  }
}

export function statusForBigisubResponse(input: {
  ok: boolean;
  status?: string | null;
}): TransactionStatus {
  if (!input.ok) return "fulfilment_failed";
  switch (String(input.status ?? "").trim().toLowerCase()) {
    case "successful":
    case "success":
    case "delivered":
      return "delivered";
    case "pending":
    case "processing":
      return "fulfilment_pending";
    default:
      return "fulfilment_failed";
  }
}

/**
 * A network timeout is NOT a failure. VTPass may well have delivered; we just
 * did not hear. Reversing here is how a customer gets refunded *and* credited,
 * which costs us the airtime.
 */
export function statusForFulfilmentTimeout(): TransactionStatus {
  return "fulfilment_pending";
}

// ─────────────────────────────────────────────────────────────
// Mono webhook -> state
// ─────────────────────────────────────────────────────────────

export function statusForMonoEvent(eventType: string | undefined | null): TransactionStatus | null {
  const value = String(eventType ?? "").trim().toLowerCase();
  if (value.includes("failed") || value.includes("declined") || value.includes("cancelled")) {
    return "payment_failed";
  }
  if (value.includes("successful") || value.includes("succeeded") || value.includes("paid")) {
    return "paid";
  }
  // Unknown event types are ignored rather than guessed at. A webhook we do
  // not understand must never advance a transaction.
  return null;
}

/**
 * The amount the bank actually took must equal the amount we priced. A
 * mismatch is not a rounding question — it means the request we think we made
 * is not the one that was paid, so it is quarantined for a human instead of
 * being fulfilled.
 */
export function paymentMatchesPricedAmount(
  pricedAmount: number,
  paidAmount: number | null | undefined,
): boolean {
  if (typeof paidAmount !== "number" || !Number.isFinite(paidAmount)) return false;
  // Naira, numeric(12,2). Compare in kobo to dodge float noise; the ledger
  // itself never stores kobo.
  return Math.round(pricedAmount * 100) === Math.round(paidAmount * 100);
}

// ─────────────────────────────────────────────────────────────
// Refund scheduling
// ─────────────────────────────────────────────────────────────

/** Give up and escalate to a human after this many tries. */
export const MAX_REFUND_ATTEMPTS = 8;

/**
 * Backoff for refund retries, in seconds. Fast at first — a transient Mono
 * error usually clears in seconds and the customer is still looking at their
 * phone — then slower, because after an hour the problem is not transient.
 */
const REFUND_BACKOFF_SECONDS = [30, 120, 600, 1_800, 3_600, 10_800, 21_600, 43_200];

export function refundBackoffSeconds(attempts: number): number {
  const index = Math.max(0, Math.min(attempts, REFUND_BACKOFF_SECONDS.length - 1));
  return REFUND_BACKOFF_SECONDS[index];
}

export function refundExhausted(attempts: number): boolean {
  return attempts >= MAX_REFUND_ATTEMPTS;
}

/**
 * How long before an unsettled transaction is worth chasing. Requerying a
 * one-second-old transaction just annoys the provider and tells us nothing.
 */
export const REQUERY_AFTER_SECONDS = 120;

/** Past this, a human should be looking at it regardless of state. */
export const STUCK_AFTER_SECONDS = 3_600;

export function needsRequery(status: TransactionStatus, ageSeconds: number): boolean {
  return status === "fulfilment_pending" && ageSeconds >= REQUERY_AFTER_SECONDS;
}

export function isStuck(status: TransactionStatus, ageSeconds: number): boolean {
  return !isTerminal(status) && ageSeconds >= STUCK_AFTER_SECONDS;
}

// ─────────────────────────────────────────────────────────────
// What the customer is told
// ─────────────────────────────────────────────────────────────

/**
 * Deliberately never says "delivered" for a pending state. Telling somebody
 * they have airtime they have not got is the commonest complaint in this
 * business and the easiest to avoid.
 */
export const CUSTOMER_STATUS_COPY: Record<TransactionStatus, string> = {
  initiated: "Confirming with your bank…",
  payment_failed: "Your bank declined this payment. Nothing was charged.",
  paid: "Payment confirmed",
  fulfilling: "Sending…",
  fulfilment_pending: "Confirming with the network. This can take a minute.",
  delivered: "Delivered",
  fulfilment_failed: "The network could not complete this. Your refund is on its way.",
  refund_pending: "Refunding…",
  refunded: "Refunded",
  refund_failed: "Refund delayed — our team is on it.",
  quarantined: "On hold for review. Our team will contact you.",
};

/** True when the customer's money is with us and undelivered. */
export function holdsCustomerFunds(status: TransactionStatus): boolean {
  return (
    status === "paid" ||
    status === "fulfilling" ||
    status === "fulfilment_pending" ||
    status === "fulfilment_failed" ||
    status === "refund_pending" ||
    status === "refund_failed" ||
    status === "quarantined"
  );
}
