import { MonoError, call } from "./mono.ts";

/**
 * The one payments-side question that needs the CONNECT app's key: what bank
 * a linked account is at.
 *
 * mono.ts moves money and never reads MONO_SECRET_KEY — a test pins that, so
 * the bank-linking key cannot drift into a payment call. Reading back an
 * account linked through the Connect app is the exception, since only that
 * app can see it, and it lives here so the exception stays visible.
 */

function connectKey(): string {
  return (Deno.env.get("MONO_SECRET_KEY") ?? "").trim();
}

/**
 * A linked account's bank code, which Mono needs beside the account number
 * to set up a mandate.
 *
 * Mono has spelled the field both ways (bank_code on account details, bankCode
 * on the account embedded in a DirectPay event), so both are read. Null when
 * absent: the caller refuses rather than guess, because a wrong bank code is
 * a mandate on the wrong account.
 */
export async function linkedAccountBankCode(monoAccountId: string): Promise<string | null> {
  const key = connectKey();
  if (!key) throw new MonoError("Mono bank linking is not configured", false, "NOT_CONFIGURED");

  const payload = await call<{ data?: Record<string, unknown> }>(
    `/v2/accounts/${encodeURIComponent(monoAccountId)}`,
    { method: "GET", key },
  );
  const data = payload.data ?? {};
  const account = (isRecord(data.account) ? data.account : data) as Record<string, unknown>;
  const institution = isRecord(account.institution) ? account.institution : {};
  const code = institution.bank_code ?? institution.bankCode;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
