/**
 * Webhook authentication.
 *
 * Zero imports beyond Web Crypto, which Deno and Node 18+ both provide as a
 * global, so the test suite runs exactly this code.
 *
 * Why this module is the most security-critical thing in the payment rail:
 * once a payment confirmation arrives by webhook, **that endpoint is what
 * authorises spending**. An unauthenticated webhook URL lets anyone POST
 * "payment successful" and mint free airtime at MiliPay's expense — the same
 * class of hole as the fictional balance ledger, rebuilt somewhere new.
 *
 * Three rules, all enforced here:
 *
 *   1. No secret configured means NOTHING is valid. Never fail open.
 *   2. Every comparison is constant-time. A byte-at-a-time compare leaks the
 *      secret to anyone willing to send a few thousand requests.
 *   3. An unrecognised or absent signature is invalid, not "probably fine".
 */

export type SignatureMethod = "hmac-sha256" | "shared-secret" | "none";

export interface VerificationResult {
  valid: boolean;
  method: SignatureMethod;
  /** Safe to log. Never contains the secret or any part of it. */
  reason?: string;
}

/**
 * Compares without leaking where the first difference is.
 *
 * Length is compared up front because it is not secret — an attacker already
 * knows how long a hex digest is — but the content comparison always walks
 * every byte.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function sha256Hex(payload: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
}

export interface VerifyInput {
  /** The body exactly as received. Re-serialising it changes the digest. */
  rawBody: string;
  /** Mono's HMAC header, when present. */
  signatureHeader?: string | null;
  /** Mono's shared-secret header, the older scheme. */
  secretHeader?: string | null;
  /** From Edge Function config. Never from the request. */
  secret?: string | null;
}

/**
 * Prefers HMAC when the sender offers it, because a shared secret in a header
 * is replayable by anyone who has ever seen one request.
 */
export async function verifyWebhookSignature(input: VerifyInput): Promise<VerificationResult> {
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";

  if (!secret) {
    // Fail closed. A missing secret is a deployment mistake, and treating it
    // as "no verification required" turns the mistake into an open door.
    return {
      valid: false,
      method: "none",
      reason: "no webhook secret configured; refusing to trust any caller",
    };
  }

  const signature = typeof input.signatureHeader === "string" ? input.signatureHeader.trim() : "";
  if (signature) {
    const expected = await hmacSha256Hex(secret, input.rawBody ?? "");
    // Some senders prefix the scheme, e.g. "sha256=abc123".
    const provided = signature.includes("=") ? signature.split("=").pop()!.trim() : signature;
    return constantTimeEqual(expected, provided.toLowerCase())
      ? { valid: true, method: "hmac-sha256" }
      : { valid: false, method: "hmac-sha256", reason: "signature did not match" };
  }

  const shared = typeof input.secretHeader === "string" ? input.secretHeader.trim() : "";
  if (shared) {
    return constantTimeEqual(secret, shared)
      ? { valid: true, method: "shared-secret" }
      : { valid: false, method: "shared-secret", reason: "shared secret did not match" };
  }

  return {
    valid: false,
    method: "none",
    reason: "request carried no signature or secret header",
  };
}

/**
 * Pulls a stable EVENT id out of a provider payload so a replay can be
 * recognised.
 *
 * A REFERENCE IS NOT AN EVENT ID, and this used to treat it as one. That is a
 * silent, total failure of the payment rail, not a nuisance:
 *
 *   1. Mono sends `payment_processing` for reference X. We store an idempotency
 *      row keyed on X, map the event to nothing, and correctly ignore it.
 *   2. Mono then sends `payment_successful` for the same reference X.
 *   3. The unique index rejects it as a duplicate. We answer 200.
 *
 * The transaction never leaves `initiated`, the customer's money is gone,
 * nothing is ever delivered, and Mono is told everything went fine. DirectPay
 * — the mode this MVP runs on — sends exactly that pair, so this was reachable
 * on the very first sandbox purchase.
 *
 * The fallback is a hash of the body, which differs between two events about
 * the same transaction and matches for a true byte-identical replay. A retry
 * whose body differs only by a timestamp will slip past this index, which is
 * why the state machine refuses to re-apply a status a transaction has already
 * left — the two together are what make a replay safe.
 */
export async function webhookEventId(
  payload: Record<string, unknown>,
  rawBody: string,
): Promise<string> {
  // ENVELOPE ONLY. Anything inside `data` describes the RESOURCE — the
  // payment, the mandate, the transaction — and is therefore the same on every
  // event about it, which is the precise mistake described above. Mono puts
  // its per-event id at the top level as `event_id`.
  for (const key of ["id", "event_id", "eventId", "_id"]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `sha256:${await sha256Hex(rawBody)}`;
}
