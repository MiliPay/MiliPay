import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient, json } from "../_shared/auth.ts";
import { smileSignatureMessage } from "../_shared/signup.ts";

/**
 * Smile ID verification results (Biometric KYC for self sign-up).
 *
 * Smile ID calls this, not a person, so it runs without a JWT. It is
 * authenticated by Smile ID's own signature: base64 HMAC-SHA256 of
 * Response-Timestamp + partner id + "sid_request", keyed with the API key
 * that only Smile ID and our server hold. Anything unsigned, or signed
 * wrongly, is refused before the body is read.
 *
 * The payload is stored by job id and nothing else happens here: the signup
 * function applies it when the app asks (selfie_status), so a result that
 * arrives before the app has reported its job id is not lost. Delivery is
 * at-least-once, so storing is an upsert.
 */

const encoder = new TextEncoder();

async function expectedSignature(timestamp: string, partnerId: string, apiKey: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(smileSignatureMessage(timestamp, partnerId)));
  let binary = "";
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b);
  return btoa(binary);
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const partnerId = Deno.env.get("SMILE_PARTNER_ID") ?? "";
  const apiKey = Deno.env.get("SMILE_API_KEY") ?? "";
  if (!partnerId || !apiKey) {
    // Not switched on: refuse, so Smile ID retries once it is.
    return json({ success: false, error: "Not configured" }, 503);
  }

  const signature = req.headers.get("response-signature") ?? "";
  const timestamp = req.headers.get("response-timestamp") ?? "";
  if (!signature || !timestamp || !sameString(signature, await expectedSignature(timestamp, partnerId, apiKey))) {
    console.warn("[smile-webhook] refused: bad or missing signature");
    return json({ success: false, error: "Invalid signature" }, 401);
  }

  const payload = await req.json().catch(() => null);
  const jobId = payload?.partner_params?.job_id;
  if (!payload || typeof jobId !== "string" || !jobId) {
    return json({ success: false, error: "No job id" }, 400);
  }

  const admin = adminClient();
  const { error } = await admin.from("smile_results").upsert({
    job_id: jobId,
    user_id: typeof payload?.partner_params?.user_id === "string" ? payload.partner_params.user_id : null,
    product: typeof payload?.product === "string" ? payload.product : null,
    status: typeof payload?.status === "string" ? payload.status : null,
    reason: typeof payload?.reason === "string" ? payload.reason : null,
    payload,
    received_at: new Date().toISOString(),
  });
  if (error) {
    // Not acknowledged, so Smile ID tries again.
    console.error("[smile-webhook] result not stored", error);
    return json({ success: false, error: "Not stored" }, 503);
  }
  return json({ success: true });
});
