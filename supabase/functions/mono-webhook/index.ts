import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";
import {
  sha256Hex,
  verifyWebhookSignature,
  webhookEventId,
} from "../_shared/webhook-auth.ts";
import { koboToNaira } from "../_shared/money.ts";
import {
  paymentMatchesPricedAmount,
  statusForMonoEvent,
} from "../_shared/vtu-state.ts";
import { transitionTransaction } from "../_shared/transactions.ts";

/**
 * Mono payment confirmation.
 *
 * THIS ENDPOINT IS THE MONEY. It is the thing that says a customer's bank has
 * paid, and therefore the thing that authorises MiliPay to spend its own
 * balance at VTPass. Anyone who can forge a request here gets free airtime.
 *
 * It is deployed with --no-verify-jwt, because Mono has no Supabase session —
 * which means the signature check below is the ONLY thing standing in front
 * of it. Four rules:
 *
 *   1. Verify before parsing. An unsigned or wrongly-signed request is
 *      rejected without its body being interpreted at all.
 *   2. Idempotent by event id. Providers retry by design; a replay must do
 *      nothing.
 *   3. Advance only. It can move a transaction from `initiated` onwards. It
 *      can never create one, change an amount, or resurrect a terminal state.
 *   4. The amount must equal what we priced. A mismatch is quarantined for a
 *      human, never fulfilled.
 *
 * Returns 200 for anything it has handled or deliberately ignored, so Mono
 * stops retrying. 401 only for a failed signature.
 */

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return respond(405, { error: "method not allowed" });
  }

  // The body must be read exactly as sent: re-serialising JSON changes the
  // bytes and therefore the digest.
  const rawBody = await req.text();

  const verification = await verifyWebhookSignature({
    rawBody,
    signatureHeader: req.headers.get("mono-webhook-signature"),
    secretHeader: req.headers.get("mono-webhook-secret"),
    secret: Deno.env.get("MONO_WEBHOOK_SECRET"),
  });

  if (!verification.valid) {
    // Deliberately terse to the caller. The detail goes to our logs, because
    // telling an attacker which part of their forgery was wrong helps them.
    console.error(`[mono-webhook] rejected: ${verification.reason} (${verification.method})`);
    return respond(401, { error: "unauthorised" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respond(400, { error: "malformed body" });
  }

  const admin = adminClient();
  const eventId = await webhookEventId(payload, rawBody);
  const eventType = String(payload.event ?? payload.type ?? "");
  const data = (payload.data ?? {}) as Record<string, unknown>;

  /**
   * Mono calls it `reference_number`, not `reference`.
   *
   * This read `data.reference` only, which Mono never sends on a debit event.
   * Every webhook therefore fell through to "ignored:no_reference": the
   * transaction stayed at `initiated`, never reached `paid`, and nothing was
   * ever fulfilled. The whole rail was silently open-circuit.
   *
   * Confirmed against Mono's Direct Debit webhook reference, which shows
   * data.reference_number carrying the value we sent as `reference` on the
   * debit. The other spellings are kept because DirectPay and Direct Debit are
   * different product lines at Mono and do not word this identically.
   */
  const reference = String(
    data.reference_number ??
      data.reference ??
      data.referenceNumber ??
      payload.reference ??
      "",
  ).trim();

  // Idempotency. The unique index on (provider, event_id) is what actually
  // enforces this; the insert failing IS the duplicate check, so there is no
  // read-then-write race.
  const { error: dupeError } = await admin.from("webhook_events").insert({
    provider: "mono",
    event_id: eventId,
    event_type: eventType || null,
    reference: reference || null,
    signature_valid: true,
    payload_sha256: await sha256Hex(rawBody),
  });

  if (dupeError) {
    if ((dupeError as { code?: string }).code === "23505") {
      return respond(200, { ok: true, duplicate: true });
    }
    console.error("[mono-webhook] could not record event", dupeError);
    // Refusing here would make Mono retry, and the retry would hit the same
    // problem. Carrying on without the idempotency record is worse. Ask for a
    // retry and let it settle.
    return respond(503, { error: "temporarily unavailable" });
  }

  const finish = async (result: string, status = 200, extra: Record<string, unknown> = {}) => {
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), result })
      .eq("provider", "mono")
      .eq("event_id", eventId);
    return respond(status, { ok: status === 200, result, ...extra });
  };

  const target = statusForMonoEvent(eventType);
  if (!target) {
    // An event we do not understand must never advance a transaction.
    return finish("ignored:unknown_event");
  }

  if (!reference) {
    return finish("ignored:no_reference");
  }

  const { data: tx, error: txError } = await admin
    .from("transactions")
    .select("id, reference, status, amount, user_id")
    .eq("reference", reference)
    .maybeSingle();

  if (txError) {
    console.error("[mono-webhook] lookup failed", txError);
    return respond(503, { error: "temporarily unavailable" });
  }

  if (!tx) {
    // The webhook cannot create a transaction. If we have no record of the
    // reference, something is wrong on one side or the other and a human
    // should see it — but Mono should stop retrying.
    console.error(`[mono-webhook] no transaction for reference ${reference}`);
    return finish("ignored:unknown_reference");
  }

  if (tx.status !== "initiated") {
    // Advance only. A terminal or already-advanced transaction is left alone.
    return finish(`ignored:already_${tx.status}`);
  }

  if (target === "payment_failed") {
    await transitionTransaction(admin, {
      reference,
      from: "initiated",
      to: "payment_failed",
      reason: "bank declined",
      actor: "mono-webhook",
      metadata: { eventType },
    });
    return finish("payment_failed");
  }

  /**
   * A PARTIAL collection is not payment, and this branch is what makes that
   * true rather than accidental.
   *
   * statusForMonoEvent maps partial_debit_successful to `quarantined`, but
   * this handler used to check only for payment_failed and then comment
   * "target === paid" — so a partial debit fell into the paid path and was
   * caught, if at all, by the amount comparison below. That works only while
   * the partial amount differs from what we priced. A sweep that collected the
   * full amount but was still labelled partial would have been marked paid and
   * FULFILLED: full value dispensed against a collection Mono had not
   * finished. Named and handled here so it does not depend on luck.
   */
  if (target === "quarantined") {
    console.error(`[mono-webhook] PARTIAL DEBIT on ${reference} — quarantining, not fulfilling`);
    await transitionTransaction(admin, {
      reference,
      from: "initiated",
      to: "quarantined",
      reason: `partial collection (${eventType})`,
      actor: "mono-webhook",
      metadata: { eventType, paidAmount: data.amount ?? null },
    });
    return finish("quarantined:partial_debit");
  }

  if (target !== "paid") {
    // Anything else the mapping might grow. Advancing on a status this handler
    // has not been taught is how value gets dispensed by accident.
    console.error(`[mono-webhook] unhandled target ${target} for ${reference}`);
    return finish(`ignored:unhandled_target_${target}`);
  }

  // Before anything is spent, the amount the bank actually took must equal the
  // amount we priced.
  let paidNaira: number | null = null;
  try {
    paidNaira = data.amount === undefined || data.amount === null
      ? null
      : koboToNaira(data.amount as number);
  } catch {
    paidNaira = null;
  }

  if (!paymentMatchesPricedAmount(Number(tx.amount), paidNaira)) {
    // Not a rounding question: the request we think we made is not the one
    // that was paid. Quarantine rather than fulfil.
    console.error(
      `[mono-webhook] AMOUNT MISMATCH on ${reference}: priced ${tx.amount}, paid ${paidNaira}`,
    );
    await transitionTransaction(admin, {
      reference,
      from: "initiated",
      to: "quarantined",
      reason: `amount mismatch: priced ${tx.amount}, paid ${paidNaira}`,
      actor: "mono-webhook",
      metadata: { eventType, pricedAmount: tx.amount, paidAmount: paidNaira },
    });
    return finish("quarantined:amount_mismatch");
  }

  const moved = await transitionTransaction(admin, {
    reference,
    from: "initiated",
    to: "paid",
    actor: "mono-webhook",
    patch: {
      mono_payment_id: typeof data.id === "string" ? data.id : null,
      payment_provider: "mono",
      payment_reference: reference,
    },
    metadata: { eventType, paidAmount: paidNaira },
  });

  if (!moved.ok) {
    // Another delivery won the race. That is the system working.
    return finish(`ignored:${moved.reason}`);
  }

  // Money is confirmed. Now — and only now — spend ours.
  //
  // Fulfilment is handed to vtu-service rather than done here, so that the
  // rules about which gateway serves which network live in one place. It runs
  // after the response where the runtime supports it, because Mono wants a
  // fast 200 and a slow webhook gets retried.
  const fulfil = triggerFulfilment(reference);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(fulfil);
  } else {
    await fulfil;
  }

  return finish("paid");
});

/**
 * Calls vtu-service's internal fulfil action with the service role.
 *
 * A failure here is survivable: the transaction is sitting in `paid`, and the
 * reconciliation job picks up anything that has not moved on. What must not
 * happen is this throwing into the webhook response and making Mono retry a
 * payment we have already accepted.
 */
async function triggerFulfilment(reference: string): Promise<void> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/vtu-service`;
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "x-internal-call": "fulfil",
      },
      body: JSON.stringify({ action: "fulfil", reference }),
    });

    if (!res.ok) {
      console.error(`[mono-webhook] fulfilment trigger returned ${res.status} for ${reference}`);
    }
  } catch (err) {
    console.error(`[mono-webhook] fulfilment trigger failed for ${reference}`, err);
  }
}
