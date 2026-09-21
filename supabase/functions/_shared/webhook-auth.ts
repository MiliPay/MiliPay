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
 * Pulls a stable event id out of a provider payload so a replay can be
 * recognised. Falls back to a hash of the body: a provider that sends no id at
 * all still must not be replayable.
 */
export async function webhookEventId(
  payload: Record<string, unknown>,
  rawBody: string,
): Promise<string> {
  for (const key of ["id", "event_id", "eventId", "reference", "_id"]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const data = payload?.data as Record<string, unknown> | undefined;
  for (const key of ["id", "reference", "_id"]) {
    const value = data?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `sha256:${await sha256Hex(rawBody)}`;
}
