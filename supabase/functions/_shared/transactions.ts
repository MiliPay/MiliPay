import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertTransition, type TransactionStatus } from "./vtu-state.ts";

/**
 * The only sanctioned way to move a transaction between states.
 *
 * Two properties it exists to guarantee:
 *
 * 1. The move is legal. assertTransition holds the machine; without a single
 *    choke point every call site would have to remember it, and one that
 *    forgot could write `delivered` over a refund.
 *
 * 2. The move is atomic. The UPDATE carries `.eq("status", from)`, so if two
 *    webhook deliveries race, exactly one wins and the loser is told it lost
 *    rather than both proceeding to fulfil. A read-then-write would double
 *    spend here, and webhook providers retry by design.
 *
 * Every transition also appends to transaction_events, which is append-only at
 * the database level. Statuses get overwritten; "what happened to my money"
 * has to survive.
 */

export interface TransitionRequest {
  reference: string;
  from: TransactionStatus;
  to: TransactionStatus;
  reason?: string;
  actor?: string;
  /** Extra columns to write in the same UPDATE, e.g. operator_reference. */
  patch?: Record<string, unknown>;
  /** Recorded on the event row, not on the transaction. */
  metadata?: Record<string, unknown>;
}

export interface TransitionOutcome {
  ok: boolean;
  /** False when another writer got there first, or the move was illegal. */
  reason?: string;
  transactionId?: string;
}

/** Timestamp column that each state stamps on arrival. */
const ARRIVAL_TIMESTAMP: Partial<Record<TransactionStatus, string>> = {
  initiated: "initiated_at",
  paid: "paid_at",
  delivered: "fulfilled_at",
  refunded: "refunded_at",
};

export async function transitionTransaction(
  admin: SupabaseClient,
  request: TransitionRequest,
): Promise<TransitionOutcome> {
  const legality = assertTransition(request.from, request.to);
  if (!legality.ok) {
    console.error(`[tx] illegal transition on ${request.reference}: ${legality.reason}`);
    return { ok: false, reason: legality.reason };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...(request.patch ?? {}),
    status: request.to,
    updated_at: now,
  };

  const stamp = ARRIVAL_TIMESTAMP[request.to];
  if (stamp) patch[stamp] = now;
  if (request.reason) patch.failure_reason = request.reason;

  // The .eq on status is the lock. Whoever matches first wins; a second
  // delivery of the same webhook matches nothing and is told so.
  const { data, error } = await admin
    .from("transactions")
    .update(patch)
    .eq("reference", request.reference)
    .eq("status", request.from)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[tx] transition failed on ${request.reference}`, error);
    return { ok: false, reason: "write failed" };
  }

  if (!data) {
    // Not an error: the usual cause is a duplicate webhook arriving after the
    // first one already advanced the row.
    return { ok: false, reason: `no transaction in ${request.from}` };
  }

  const { error: eventError } = await admin.from("transaction_events").insert({
    transaction_id: data.id,
    reference: request.reference,
    from_status: request.from,
    to_status: request.to,
    reason: request.reason ?? null,
    actor: request.actor ?? "system",
    metadata: request.metadata ?? {},
  });

  if (eventError) {
    // The money already moved; losing the audit line must not undo it. Loud,
    // because a gap in this table is a gap in the answer to "what happened".
    console.error(`[tx] EVENT NOT RECORDED for ${request.reference}`, eventError);
  }

  return { ok: true, transactionId: data.id };
}

/** Puts a transaction in the refund queue, or notes that it is already there. */
export async function enqueueRefund(
  admin: SupabaseClient,
  args: { transactionId: string; reference: string; amount: number; reason: string },
): Promise<boolean> {
  const { error } = await admin.from("refund_queue").insert({
    transaction_id: args.transactionId,
    reference: args.reference,
    amount: args.amount,
    reason: args.reason,
  });

  if (error) {
    // 23505 is the partial unique index: one open refund per transaction. A
    // second attempt to queue the same refund is the expected case on retry,
    // not a problem.
    if ((error as { code?: string }).code === "23505") return true;
    console.error(`[tx] REFUND NOT QUEUED for ${args.reference}`, error);
    return false;
  }
  return true;
}
