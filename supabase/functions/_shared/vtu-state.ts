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
 * VTPass reports an outcome in TWO fields, and reading only one is wrong.
 *
 * `code` says whether the REQUEST was accepted. `000` is "TRANSACTION
 * PROCESSED", not "delivered" — the actual outcome is in
 * content.transactions.status, one of initiated / pending / delivered. Reading
 * 000 as success is how a customer is told they have airtime that VTPass later
 * failed to send.
 *
 * So the code is checked first for the things only it can say (declines, a
 * flat wallet, a duplicate), and the status decides the rest.
 *
 * This is the ONLY gateway mapper. There used to be a second, single-argument
 * one for BigiSub's status words; handed a VTPass response it would have read
 * every code as unknown and answered "pending" for ever. It had no caller and
 * was removed, and tests/gateway-isolation.test.ts fails if it comes back.
 *
 * Codes from https://vtpass.com/documentation/response-codes/
 */
export function statusForVtpassResponse(
  code: string | undefined | null,
  status: string | undefined | null,
): TransactionStatus {
  const value = String(code ?? "").trim();

  switch (value) {
    // Still working. Requery resolves it; the sweep will.
    case "099": // TRANSACTION IS PROCESSING
    case "089": // REQUEST IS PROCESSING
      return "fulfilment_pending";

    // 015 INVALID REQUEST ID: VTPass has no record of this request_id. On a
    // requery that usually means the purchase never reached them — but "we
    // cannot find it" is not "it failed", and refunding something that did
    // land costs us the value. Pending, so it surfaces for a person after 30
    // minutes rather than being refunded blind.
    case "015":
    // 085 IMPROPER REQUEST ID: the id's date part was rejected. We cannot
    // tell from here whether that was the purchase or a later requery of an
    // older id, so the same reasoning applies.
    case "085":
      return "fulfilment_pending";

    // 014 means this request_id was already submitted, so the FIRST submission
    // may well have delivered. Pending, never failed — see vtpass.ts rule 3.
    case "014":
      return "fulfilment_pending";

    case "016": // TRANSACTION FAILED
    case "040": // TRANSACTION REVERSAL
    case "091": // TRANSACTION NOT PROCESSED
    case "010": // invalid variation code
    case "011": // invalid arguments
    case "012": // product does not exist
    case "013": // below minimum
    case "017": // above maximum
    case "018": // LOW WALLET BALANCE — ours, and the customer must be refunded
    case "021": // account locked
    case "022": // account suspended
    case "023": // api access not enabled
    case "024": // account inactive
    case "027": // ip not whitelisted
    case "028": // product not whitelisted
    case "034": // service suspended
    case "035": // service inactive
    case "087": // invalid credentials
      return "fulfilment_failed";

    // 019 is a suspected duplicate inside 30 seconds. We cannot tell from here
    // whether the first one landed, so it is pending rather than failed.
    case "019":
      return "fulfilment_pending";

    // 030 BILLER NOT REACHABLE and 083 SYSTEM ERROR are VTPass telling us it
    // could not reach the operator. It may still have. Pending.
    case "030":
    case "083":
      return "fulfilment_pending";

    case "000": // TRANSACTION PROCESSED — the status field decides
    case "044": // TRANSACTION RESOLVED
    // 001 TRANSACTION QUERY is "the current status of a given transaction",
    // so its status field is the answer. It used to be forced to pending,
    // which would have left a requery reporting 001 + delivered pending until
    // a person resolved by hand what VTPass had already said.
    case "001":
      break;

    default:
      // An unrecognised code is not a licence to guess. Unknown is pending,
      // because declaring failure triggers a refund and refunding something
      // that was delivered costs us the value.
      return "fulfilment_pending";
  }

  switch (String(status ?? "").trim().toLowerCase()) {
    case "delivered":
    case "successful":
    case "success":
      return "delivered";
    case "failed":
    case "reversed":
    case "cancelled":
      return "fulfilment_failed";
    case "initiated":
    case "pending":
    case "processing":
    default:
      return "fulfilment_pending";
  }
}

/**
 * The outcome when a purchase call did not return cleanly — a timeout, a 5xx,
 * an unreadable body.
 *
 * This is pending, not failure, and the distinction is expensive. The gateway
 * may well have fulfilled; we simply did not hear. Calling it a failure would
 * refund the customer AND leave them credited, at MiliPay's cost.
 */
export function statusForIndeterminateFulfilment(): TransactionStatus {
  return "fulfilment_pending";
}

/**
 * Whether a purchase call may be repeated. It may not.
 *
 * The reason changed when VTPass replaced BigiSub, but the answer did not.
 *
 * With BigiSub the danger was real duplication: no idempotency key on any
 * purchase endpoint, so a second call was a second independent purchase and
 * the customer was charged once and credited twice.
 *
 * VTPass does carry an idempotency key, so a replay is SAFE — but it is also
 * pointless: replaying a used request_id returns code 014 rather than the
 * original result, so it tells us nothing we did not already know. The
 * resolution for an uncertain purchase is requery() either way.
 *
 * A function rather than a constant so the call sites read as a decision
 * someone made, not an oversight.
 */
export function canRetryPurchase(): false {
  return false;
}

// ─────────────────────────────────────────────────────────────
// Mono webhook -> state
// ─────────────────────────────────────────────────────────────

/**
 * Mono's real event names, taken from their Direct Debit webhook reference
 * rather than guessed at:
 * https://docs.mono.co/docs/payments/direct-debit/webhook-events
 *
 * This was substring matching, which got three things wrong against the actual
 * vocabulary. `events.mandates.rejected` contains none of "failed", "declined"
 * or "cancelled", so a bank rejecting a mandate was silently ignored.
 * `events.mandate.action.cancel` is "cancel", not "cancelled", so it was
 * ignored too. And `partial_debit_successful` contains "successful", so a
 * PARTIAL collection mapped to fully paid — the amount check downstream would
 * have quarantined it, but by luck rather than design.
 */
const MONO_EVENTS: Record<string, TransactionStatus> = {
  // The customer's money arrived. This is the event that authorises MiliPay
  // to spend its own.
  "events.mandates.debit.successful": "paid",
  "events.mandates.debit_attempt.successful": "paid",

  // DirectPay — the one-off mode the sandbox MVP runs on. Mono names this
  // event `direct_debit.payment_successful` even for a one-time payment,
  // which reads like a Direct Debit event and is not one. Listed explicitly
  // so nobody "tidies it up" later on the assumption it is a duplicate.
  "direct_debit.payment_successful": "paid",
  "payment.successful": "paid",
  "mono.events.payment.successful": "paid",

  "direct_debit.payment_failed": "payment_failed",
  // DirectPay's other two endings. Neither moved money, and "abandoned"
  // matched nothing at all before — the transaction would have sat at
  // `initiated` until the stuck alarm. Named rather than left to the
  // substring net below.
  // https://docs.mono.co/docs/payments/onetime/webhook-events
  "direct_debit.payment_cancelled": "payment_failed",
  "direct_debit.payment_abandoned": "payment_failed",
  "events.mandates.debit.failed": "payment_failed",
  "events.mandates.rejected": "payment_failed",
  "events.mandate.action.cancel": "payment_failed",
  "events.mandates.expired": "payment_failed",
  "payment.failed": "payment_failed",
  "mono.events.payment.failed": "payment_failed",

  // A partial collection is NOT payment. The amount check would catch it, but
  // it is named here so the decision is explicit rather than incidental.
  "events.mandates.debit.partial_debit_successful": "quarantined",
};

export function statusForMonoEvent(eventType: string | undefined | null): TransactionStatus | null {
  const value = String(eventType ?? "").trim().toLowerCase();
  if (!value) return null;

  const mapped = MONO_EVENTS[value];
  if (mapped) return mapped;

  // Events that are real but carry no state change for us:
  // debit.processing, mandates.created, mandates.approved, mandates.ready.
  // Falling through to the heuristic below would misread some of them, so
  // they are named and ignored.
  if (
    value.includes("processing") ||
    value.includes("created") ||
    value.includes("approved") ||
    value.includes("ready") ||
    value.includes("pause") ||
    value.includes("reinstate")
  ) {
    return null;
  }

  // A conservative net for event names Mono adds later. Kept deliberately
  // narrow: anything it does not recognise is ignored, not guessed.
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
  // Covers a bank declining, the customer abandoning or cancelling, and Mono
  // refusing to start the payment at all. Only the first is the bank, so the
  // copy blames nobody.
  payment_failed: "This payment didn't go through. Nothing was charged.",
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
