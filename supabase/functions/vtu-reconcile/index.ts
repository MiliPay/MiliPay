import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { adminClient } from "../_shared/auth.ts";
import { MonoError, refundPayment } from "../_shared/mono.ts";
import {
  REQUERY_AFTER_SECONDS,
  STUCK_AFTER_SECONDS,
  UNSETTLED_STATES,
  refundBackoffSeconds,
  refundExhausted,
  statusForVtpassResponse,
} from "../_shared/vtu-state.ts";
import { enqueueRefund, transitionTransaction } from "../_shared/transactions.ts";
import * as vtpass from "../_shared/vtpass.ts";

/**
 * The sweep that finishes what the happy path could not.
 *
 * Three things go wrong in a payment system and none of them announce
 * themselves:
 *
 *   1. VTPass said "processing", or said nothing at all, and never came back.
 *      The customer paid and is waiting. Nothing in the request/response path
 *      will ever resolve this.
 *   2. A refund failed. Previously that was a console.error and the money
 *      simply stayed gone.
 *   3. A transaction got stuck between states — a crash, a lost webhook — and
 *      would sit there forever with the customer's money in it.
 *
 * Run by pg_cron. Authenticated with a DEDICATED secret rather than the
 * service role key: this endpoint only triggers a sweep, so a leaked token
 * is worth far less than a leaked service key, and pg_cron
 * job definitions are readable by anyone with database owner access.
 *
 * Every item is isolated. One transaction that throws must not abort the
 * sweep and leave the rest unprocessed — that is how a single poison row
 * silently stops all reconciliation.
 */

/** Bounded so one invocation cannot run past the function timeout. */
const BATCH = 25;

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The secret lives in Vault, generated inside Postgres. This function never
 * holds a copy — it hands the candidate to reconcile_secret_matches() and
 * Postgres answers yes or no, comparing digests so the answer takes the same
 * shape however much of the candidate was right.
 *
 * Keeping it out of the function's environment means it never transits a
 * shell, a CLI invocation or a transcript on its way to being configured.
 */
async function authorised(req: Request, admin: SupabaseClient): Promise<boolean> {
  const provided = (req.headers.get("x-reconcile-secret") ?? "").trim();
  if (!provided) return false;

  const { data, error } = await admin.rpc("reconcile_secret_matches", {
    p_candidate: provided,
  });

  if (error) {
    // Cannot verify means not authorised. An outage in the check must never
    // become an open door.
    console.error("[reconcile] could not verify the reconcile secret", error);
    return false;
  }
  return data === true;
}

// ─────────────────────────────────────────────────────────────
// 1. Requery — ask VTPass what actually happened
// ─────────────────────────────────────────────────────────────

/**
 * NOTE THE MISSING FILTER. This used to require operator_transaction_id to be
 * non-null, because BigiSub's requery was keyed on an id that only arrives in
 * a response — so a purchase whose call timed out had no id, could never be
 * asked about, and sat pending until a human went to look.
 *
 * Those are precisely the transactions that most need resolving, and under
 * VTPass they are resolvable: the request_id is derived from the reference and
 * the transaction's own timestamp, both of which we always hold. Restoring
 * that filter would silently reinstate the blind spot.
 */
async function sweepRequery(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - REQUERY_AFTER_SECONDS * 1000).toISOString();

  const { data: rows } = await admin
    .from("transactions")
    .select("id, reference, amount, initiated_at, created_at, updated_at")
    .eq("status", "fulfilment_pending")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(BATCH);

  let resolved = 0;
  let stillPending = 0;

  for (const row of rows ?? []) {
    try {
      // initiated_at is nullable; created_at is not. Without one of them the
      // request_id cannot be rebuilt and there is nothing to ask.
      const issuedAt = (row.initiated_at ?? row.created_at) as string | null;
      if (!issuedAt) {
        console.error(`[reconcile] no timestamp for ${row.reference}; cannot rebuild request_id`);
        stillPending++;
        continue;
      }

      const result = await vtpass.requery(row.reference as string, issuedAt);
      const status = statusForVtpassResponse(result.providerCode, result.providerStatus);

      if (status === "fulfilment_pending") {
        stillPending++;
        // Touch updated_at so the next sweep does not re-pick this one
        // immediately and hammer VTPass with the same question.
        await admin
          .from("transactions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", row.id);
        continue;
      }

      await transitionTransaction(admin, {
        reference: row.reference as string,
        from: "fulfilment_pending",
        to: status,
        actor: "reconcile",
        patch: {
          token: result.token ?? null,
          units: result.units ?? null,
          ...(result.operatorReference
            ? { operator_transaction_id: result.operatorReference }
            : {}),
        },
        metadata: { providerCode: result.providerCode, providerStatus: result.providerStatus },
      });

      if (status === "fulfilment_failed") {
        const queued = await enqueueRefund(admin, {
          transactionId: row.id as string,
          reference: row.reference as string,
          amount: Number(row.amount),
          reason: "operator reported failure on requery",
        });
        if (queued) {
          await transitionTransaction(admin, {
            reference: row.reference as string,
            from: "fulfilment_failed",
            to: "refund_pending",
            actor: "reconcile",
          });
        }
      }
      resolved++;
    } catch (err) {
      // Isolated on purpose. One unresolvable transaction must not stop the
      // rest of the batch.
      console.error(`[reconcile] requery failed for ${row.reference}`, err);
    }
  }

  return { examined: rows?.length ?? 0, resolved, stillPending };
}

// ─────────────────────────────────────────────────────────────
// 2. Refunds — give the money back, with retries
// ─────────────────────────────────────────────────────────────

async function sweepRefunds(admin: SupabaseClient) {
  const { data: rows } = await admin
    .from("refund_queue")
    .select("id, transaction_id, reference, amount, attempts, reason")
    .is("resolved_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  let refunded = 0;
  let retried = 0;
  let exhausted = 0;

  for (const row of rows ?? []) {
    const attempts = Number(row.attempts) + 1;

    try {
      const { data: tx } = await admin
        .from("transactions")
        .select("mono_payment_id, status")
        .eq("id", row.transaction_id)
        .maybeSingle();

      if (!tx?.mono_payment_id) {
        // No payment id means we never got confirmation the bank was debited.
        // Refunding a payment we cannot prove happened would give away money,
        // so this is escalated to a human rather than guessed at.
        throw new MonoError("no mono payment id on this transaction", false, "NO_PAYMENT_ID");
      }

      await refundPayment({
        monoPaymentId: tx.mono_payment_id as string,
        reference: row.reference as string,
        amount: Number(row.amount),
        reason: String(row.reason ?? "fulfilment failed"),
      });

      await admin
        .from("refund_queue")
        .update({ attempts, resolved_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);

      await transitionTransaction(admin, {
        reference: row.reference as string,
        from: "refund_pending",
        to: "refunded",
        actor: "reconcile",
      });
      refunded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "refund failed";

      if (refundExhausted(attempts)) {
        // Stop retrying and make it a person's problem. A refund that keeps
        // failing is not going to start working on the ninth attempt, and
        // silently retrying forever means nobody ever looks at it.
        console.error(
          `[reconcile] REFUND EXHAUSTED for ${row.reference} after ${attempts} attempts: ${message}`,
        );
        await admin
          .from("refund_queue")
          .update({ attempts, last_error: message, resolved_at: new Date().toISOString() })
          .eq("id", row.id);
        await transitionTransaction(admin, {
          reference: row.reference as string,
          from: "refund_pending",
          to: "refund_failed",
          reason: message,
          actor: "reconcile",
        });
        exhausted++;
        continue;
      }

      await admin
        .from("refund_queue")
        .update({
          attempts,
          last_error: message,
          next_attempt_at: new Date(Date.now() + refundBackoffSeconds(attempts) * 1000).toISOString(),
        })
        .eq("id", row.id);
      retried++;
    }
  }

  return { examined: rows?.length ?? 0, refunded, retried, exhausted };
}

// ─────────────────────────────────────────────────────────────
// 3. Stuck — anything holding a customer's money too long
// ─────────────────────────────────────────────────────────────

async function sweepStuck(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - STUCK_AFTER_SECONDS * 1000).toISOString();

  const { data: rows } = await admin
    .from("transactions")
    .select("reference, status, amount, updated_at")
    .in("status", UNSETTLED_STATES as unknown as string[])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(100);

  if (rows?.length) {
    // Loud, and deliberately not auto-resolved. Every one of these is a
    // customer whose money is with us and who has nothing to show for it, and
    // guessing at the right outcome is how the wrong one gets chosen.
    console.error(
      `[reconcile] ${rows.length} STUCK transaction(s) older than ${STUCK_AFTER_SECONDS}s:`,
      rows.map((r) => `${r.reference}:${r.status}`).join(", "),
    );
  }

  return { stuck: rows?.length ?? 0, references: (rows ?? []).map((r) => r.reference) };
}

// ─────────────────────────────────────────────────────────────
// 4. Wallet — can we still deliver what we sell?
// ─────────────────────────────────────────────────────────────

async function checkWallet() {
  // VTPass's own setting only. This briefly fell back to BIGISUB_WALLET_FLOOR,
  // which let a parked provider's configuration decide when the live
  // gateway's wallet is "low" — the wrong provider steering the alarm.
  const floor = Number(Deno.env.get("VTPASS_WALLET_FLOOR") ?? "20000");
  const balance = await vtpass.walletBalance();

  // null is "unknown", not "empty". Reporting a slow gateway as a low wallet
  // would raise an alarm every time VTPass is briefly unreachable.
  if (balance === null) {
    return { balance: null, low: false, note: "balance unavailable" };
  }
  if (balance < floor) {
    // Every sale is refused once this runs out, so it wants to be noticed
    // before that rather than after. In sandbox this watches the sandbox
    // wallet, which is the point: a test run that drains it must fail the same
    // way production would.
    console.error(`[reconcile] VTPASS WALLET LOW: ${balance} below floor ${floor}`);
  }
  return { balance, low: balance < floor, floor };
}

// ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") return respond(405, { error: "method not allowed" });

  const admin = adminClient();
  if (!(await authorised(req, admin))) {
    console.error("[reconcile] rejected: bad or missing reconcile secret");
    return respond(401, { error: "unauthorised" });
  }

  const body = await req.json().catch(() => ({}));
  const task = typeof body?.task === "string" ? body.task : "all";
  const started = Date.now();
  const report: Record<string, unknown> = { task };

  try {
    if (task === "all" || task === "requery") report.requery = await sweepRequery(admin);
    if (task === "all" || task === "refunds") report.refunds = await sweepRefunds(admin);
    if (task === "all" || task === "stuck") report.stuck = await sweepStuck(admin);
    if (task === "all" || task === "wallet") report.wallet = await checkWallet();
  } catch (err) {
    console.error("[reconcile] sweep failed", err);
    return respond(500, { error: "sweep failed", ...report });
  }

  report.durationMs = Date.now() - started;
  return respond(200, { ok: true, ...report });
});
