import type { TransactionStatus } from "@milipay/shared/types";

/**
 * The transaction lifecycle, as the database actually defines it.
 *
 * Verified against the live CHECK constraint on public.transactions:
 *
 *   status IN ('initiated','payment_failed','paid','fulfilling',
 *              'fulfilment_pending','delivered','fulfilment_failed',
 *              'refund_pending','refunded','refund_failed','quarantined')
 *
 * The portals were written against an earlier vocabulary of
 * 'success' | 'failed' | 'pending'. None of those three values can exist in
 * the table, so every `status === "success"` comparison was permanently false
 * and every figure built on one read zero.
 *
 * Compare through the helpers below rather than against literals, so the next
 * rename shows up as a type error in one file instead of silently zeroing a
 * merchant's settlement total.
 */

/** Money taken and value delivered. The only state that counts as revenue. */
export function isSettled(status: string | null | undefined): boolean {
  return status === "delivered";
}

/** Terminal, and the customer did not get what they paid for. */
export function isFailed(status: string | null | undefined): boolean {
  return (
    status === "payment_failed" ||
    status === "fulfilment_failed" ||
    status === "refund_failed"
  );
}

/** The customer got their money back. Not revenue, not a failure to chase. */
export function isRefunded(status: string | null | undefined): boolean {
  return status === "refunded";
}

/**
 * Somewhere between the customer paying and the value arriving. Anything here
 * is unfinished business — it is what the Operations board exists to drain.
 */
export function isInFlight(status: string | null | undefined): boolean {
  return (
    status === "initiated" ||
    status === "paid" ||
    status === "fulfilling" ||
    status === "fulfilment_pending" ||
    status === "refund_pending"
  );
}

/** Held back for a human to look at, because the numbers did not agree. */
export function needsAttention(status: string | null | undefined): boolean {
  return status === "quarantined" || status === "refund_failed";
}

type Tone = "ok" | "warn" | "fail" | "info" | "muted";

const PRESENTATION: Record<TransactionStatus, { label: string; tone: Tone }> = {
  initiated: { label: "Awaiting payment", tone: "info" },
  paid: { label: "Paid", tone: "info" },
  fulfilling: { label: "Delivering", tone: "info" },
  fulfilment_pending: { label: "Delivery pending", tone: "warn" },
  delivered: { label: "Delivered", tone: "ok" },
  payment_failed: { label: "Payment failed", tone: "fail" },
  fulfilment_failed: { label: "Delivery failed", tone: "fail" },
  refund_pending: { label: "Refund pending", tone: "warn" },
  refunded: { label: "Refunded", tone: "muted" },
  refund_failed: { label: "Refund failed", tone: "fail" },
  quarantined: { label: "Held for review", tone: "fail" },
};

/**
 * How a status should read and which state colour it carries. An unknown value
 * is reported as unknown rather than dressed up as one of the real states —
 * showing a status we do not recognise as "Pending" is how a failed payment
 * ends up looking like one that is merely slow.
 */
export function presentTransactionStatus(status: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  if (!status) return { label: "Unknown", tone: "muted" };
  return PRESENTATION[status as TransactionStatus] ?? { label: status, tone: "muted" };
}

export const TRANSACTION_STATUSES = Object.keys(PRESENTATION) as TransactionStatus[];
