/**
 * Which Mono app a record belongs to, without storing anything secret.
 *
 * Mono scopes accounts and customers to the app that created them: an account
 * linked through one app cannot be used to pay through another. MiliPay has
 * run two apps (Connect for linking, Payments for money), so before handing
 * Mono an account id or a customer id we have to know it came from the app we
 * are about to call.
 *
 * The tag is the first 16 hex characters of SHA-256 over a fixed label and
 * the app's secret key. It identifies the key; it cannot be turned back into
 * it. A rotated key produces a new tag, which is the safe direction: records
 * made under the old key are treated as foreign and simply not reused.
 *
 * Zero imports; Deno and Node both provide crypto.subtle.
 */
export async function monoAppTag(secretKey: string | null | undefined): Promise<string | null> {
  const key = String(secretKey ?? "").trim();
  if (!key) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`milipay:mono-app:${key}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
