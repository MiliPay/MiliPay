/**
 * Outbound customer notifications — Termii SMS and Termii WhatsApp.
 *
 * Credentials are delivered to the customer's phone, never returned to the
 * caller and never rendered in a portal. `dispatchCredential` reports which
 * channel succeeded so the customer row can record it for support.
 */

/**
 * Each Termii account has its own API host, shown on the Termii dashboard
 * (e.g. https://v3.api.termii.com). Set it as TERMII_BASE_URL; the old shared
 * host is the fallback for accounts that still use it.
 */
export function termiiBaseUrl(raw: string | undefined = Deno.env.get("TERMII_BASE_URL")): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "https://api.ng.termii.com";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export type Channel = "whatsapp" | "sms" | "console";

export interface DispatchResult {
  delivered: boolean;
  channel: Channel | null;
  /** Per-channel outcome, for the function log. Never returned to a portal. */
  attempts: Array<{ channel: Channel; ok: boolean; detail: string }>;
}

function configuredChannels(): Channel[] {
  const raw = Deno.env.get("PASSWORD_DELIVERY_CHANNELS") ?? "whatsapp,sms";
  const parsed = raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is Channel => c === "whatsapp" || c === "sms" || c === "console");
  return parsed.length > 0 ? parsed : ["whatsapp", "sms"];
}

/**
 * Testing-only channel: writes the credential to the Edge Function log.
 *
 * Never in the default channel list — it has to be asked for by name. Reading
 * it requires Supabase project access, which is a far higher bar than the old
 * behaviour of rendering the password in the staff portal, but it is still a
 * credential sitting in a log. Do not enable it anywhere real customers exist.
 */
function sendToConsole(phone: string, message: string): { ok: boolean; detail: string } {
  console.warn(
    "[notify] CONSOLE DELIVERY — credential written to logs, not sent to the customer.\n" +
      `  to: ${phone}\n  message: ${message}`,
  );
  return { ok: true, detail: "console" };
}

/** Termii wants a bare MSISDN: 2348012345678, no plus. */
export function termiiMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

/** How a message leaves Termii: a text, a WhatsApp message, or a voice call reading it out. */
export type TermiiRoute = Channel | "voice";

async function sendViaTermii(
  channel: TermiiRoute,
  phone: string,
  message: string,
): Promise<{ ok: boolean; detail: string }> {
  const apiKey = Deno.env.get("TERMII_API_KEY");
  if (!apiKey) {
    return { ok: false, detail: "TERMII_API_KEY is not set" };
  }

  const senderId = channel === "whatsapp"
    ? (Deno.env.get("TERMII_WHATSAPP_SENDER") ?? "MiliPay")
    : (Deno.env.get("TERMII_SMS_SENDER") ?? "MiliPay");

  try {
    const response = await fetch(`${termiiBaseUrl()}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: termiiMsisdn(phone),
        from: senderId,
        sms: message,
        type: "plain",
        // Termii routes WhatsApp and voice through the same endpoint by
        // channel name; "dnd" is the transactional SMS route, which reaches
        // numbers on Do-Not-Disturb.
        channel: channel === "whatsapp" ? "whatsapp" : channel === "voice" ? "voice" : "dnd",
        api_key: apiKey,
      }),
    });

    const body = await response.json().catch(() => ({}));

    // Termii answers 200 with a message_id on success and an explanatory
    // payload on failure, so the status code alone is not enough.
    if (response.ok && (body?.message_id || body?.code === "ok")) {
      return { ok: true, detail: String(body?.message_id ?? "ok") };
    }

    return {
      ok: false,
      detail: `HTTP ${response.status}: ${String(body?.message ?? "unknown error")}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

// ── Termii health (Settings › Integrations) ───────────────────────────────

export type TermiiState =
  | "off"             // no key
  | "unreachable"     // network error or wrong host
  | "key_rejected"    // Termii refused the key
  | "sender_missing"  // no sender ID with our name on the account
  | "sender_pending"  // registered, not yet approved
  | "sender_blocked"
  | "no_balance"
  | "ok";

export interface TermiiHealth {
  state: TermiiState;
  balance: number | null;
  currency: string | null;
  sender: string;
  senderStatus: string | null;
}

/**
 * What the balance and sender-ID answers mean. Pure, so it can be tested:
 * `balance` and `senders` are the parsed bodies (null when the call failed),
 * `balanceStatus` the HTTP status of the balance call (0 for no answer).
 */
export function classifyTermii(input: {
  hasKey: boolean;
  balanceStatus: number;
  balance: { balance?: unknown; currency?: unknown } | null;
  senders: { content?: { sender_id?: string; status?: string }[] } | null;
  sender: string;
}): TermiiHealth {
  const base = { balance: null, currency: null, sender: input.sender, senderStatus: null };
  if (!input.hasKey) return { state: "off", ...base };
  if (input.balanceStatus === 0) return { state: "unreachable", ...base };
  if (input.balanceStatus === 401 || input.balanceStatus === 403 || input.balanceStatus === 404 || !input.balance || input.balance.balance === undefined) {
    return { state: input.balanceStatus === 404 ? "unreachable" : "key_rejected", ...base };
  }
  const balance = Number(input.balance.balance);
  const currency = typeof input.balance.currency === "string" ? input.balance.currency : null;
  const mine = (input.senders?.content ?? []).find((s) => (s.sender_id ?? "").toLowerCase() === input.sender.toLowerCase());
  const senderStatus = mine?.status?.toLowerCase() ?? null;
  const known = { balance: Number.isFinite(balance) ? balance : null, currency, sender: input.sender, senderStatus };
  if (!mine) return { state: "sender_missing", ...known };
  if (senderStatus === "pending") return { state: "sender_pending", ...known };
  if (senderStatus === "blocked") return { state: "sender_blocked", ...known };
  if (!(balance > 0)) return { state: "no_balance", ...known };
  return { state: "ok", ...known };
}

/** Asks Termii for the balance and the SMS sender ID's status. Never returns the key. */
export async function termiiHealth(): Promise<TermiiHealth> {
  const apiKey = Deno.env.get("TERMII_API_KEY") ?? "";
  const sender = Deno.env.get("TERMII_SMS_SENDER") ?? "MiliPay";
  const host = termiiBaseUrl();
  const key = encodeURIComponent(apiKey);
  let balanceStatus = 0;
  let balance = null;
  let senders = null;
  if (apiKey) {
    try {
      const r = await fetch(`${host}/api/get-balance?api_key=${key}`);
      balanceStatus = r.status;
      balance = await r.json().catch(() => null);
    } catch {
      balanceStatus = 0;
    }
    try {
      const r = await fetch(`${host}/api/sender-id?api_key=${key}&name=${encodeURIComponent(sender)}`);
      senders = r.ok ? await r.json().catch(() => null) : null;
    } catch {
      senders = null;
    }
  }
  return classifyTermii({ hasKey: Boolean(apiKey), balanceStatus, balance, senders, sender });
}

/**
 * One test SMS through Termii only (never the console fallback), so a
 * success here means a real text left Termii. Returns Termii's own words
 * on failure, which never contain the key.
 */
export async function sendTermiiTest(phone: string, message: string): Promise<{ ok: boolean; detail: string }> {
  return await sendViaTermii("sms", phone, message);
}

/** One message over one Termii route, no fallback. For code-channels.ts. */
export function sendTermii(route: "sms" | "voice" | "whatsapp", phone: string, message: string): Promise<{ ok: boolean; detail: string }> {
  return sendViaTermii(route, phone, message);
}

/** The testing-only console channel is switched on (PASSWORD_DELIVERY_CHANNELS has "console"). */
export function consoleDeliveryAllowed(): boolean {
  return configuredChannels().includes("console");
}

/**
 * A temporary password or one-time password the person isn't there to ask
 * for (new staff, approved customer, new merchant, reset by an admin).
 *
 * Never throws: a failed dispatch must not roll back an approval that has
 * already minted an auth identity. The caller records the outcome and the
 * administrator can re-send.
 */
export async function dispatchCredential(
  phone: string,
  message: string,
): Promise<DispatchResult> {
  // A temporary password goes by SMS, and by WhatsApp too once it is
  // switched on (TERMII_WHATSAPP=on): both, so it arrives whichever the
  // person uses. The console channel is only a fallback where it is on.
  const routes: Channel[] = ["sms", ...((Deno.env.get("TERMII_WHATSAPP") ?? "").trim().toLowerCase() === "on" ? ["whatsapp" as const] : [])];
  const attempts: DispatchResult["attempts"] = [];
  let first: Channel | null = null;
  for (const channel of routes) {
    const result = await sendViaTermii(channel, phone, message);
    attempts.push({ channel, ...result });
    if (result.ok && !first) first = channel;
    if (!result.ok) console.warn(`[notify] ${channel} dispatch failed: ${result.detail}`);
  }
  if (!first && configuredChannels().includes("console")) {
    attempts.push({ channel: "console", ...sendToConsole(phone, message) });
    first = "console";
  }
  return { delivered: first !== null, channel: first, attempts };
}

/**
 * A text the customer was told comes "by SMS" (a sign-in code): every
 * configured channel except WhatsApp, in order.
 */
export function dispatchSms(phone: string, message: string): Promise<DispatchResult> {
  const channels = configuredChannels().filter((c) => c !== "whatsapp");
  return dispatchVia(channels.length > 0 ? channels : ["sms"], phone, message);
}

/**
 * A notice the customer should get everywhere (account verified): every
 * configured channel, not just the first that works. Delivered if any did.
 */
export async function dispatchEverywhere(phone: string, message: string): Promise<DispatchResult> {
  const attempts: DispatchResult["attempts"] = [];
  let first: Channel | null = null;
  for (const channel of configuredChannels()) {
    const result = channel === "console"
      ? sendToConsole(phone, message)
      : await sendViaTermii(channel, phone, message);
    attempts.push({ channel, ...result });
    if (result.ok && !first) first = channel;
    if (!result.ok) console.warn(`[notify] ${channel} dispatch failed: ${result.detail}`);
  }
  return { delivered: first !== null, channel: first, attempts };
}

/** An email through Resend. Never throws; false when it was not sent. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) {
    console.error("[notify] email not sent: RESEND_API_KEY or EMAIL_FROM is not set");
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (response.ok) return true;
    const body = await response.json().catch(() => ({}));
    console.error(`[notify] email not sent: HTTP ${response.status} ${String(body?.message ?? "")}`);
    return false;
  } catch (err) {
    console.error("[notify] email not sent", err);
    return false;
  }
}

async function dispatchVia(
  channels: Channel[],
  phone: string,
  message: string,
): Promise<DispatchResult> {
  const attempts: DispatchResult["attempts"] = [];

  for (const channel of channels) {
    const result = channel === "console"
      ? sendToConsole(phone, message)
      : await sendViaTermii(channel, phone, message);
    attempts.push({ channel, ...result });
    if (result.ok) {
      return { delivered: true, channel, attempts };
    }
    console.warn(`[notify] ${channel} dispatch failed: ${result.detail}`);
  }

  return { delivered: false, channel: null, attempts };
}

export function credentialMessage(fullName: string, tempPassword: string): string {
  return (
    `Hello ${fullName}, your MiliPay account has been approved. ` +
    `Log in with your phone number and this one-time password: ${tempPassword}. ` +
    `You will be asked to change it immediately. MiliPay will never ask you for this password.`
  );
}

/** A new staff member's first sign-in. They sign in with their email, not a phone number. */
export function staffCredentialMessage(fullName: string, email: string, portalName: string, tempPassword: string): string {
  return (
    `Hello ${fullName}, you've been added to MiliPay's ${portalName}. ` +
    `Sign in with ${email} and this one-time password: ${tempPassword}. ` +
    `You'll set your own password when you first sign in. MiliPay will never ask you for this password.`
  );
}

export function rejectionMessage(fullName: string, reason: string): string {
  return (
    `Hello ${fullName}, your MiliPay registration was not approved. ` +
    `Reason: ${reason}. Please visit your local agent or contact support to resolve this.`
  );
}

/** Cryptographically secure temporary password. Math.random() is not. */
export function generateTempPassword(): string {
  // No look-alike characters: this gets read off a phone screen and typed.
  // 0/O and 1/l/I are all excluded, including from the trailing digit — that
  // used to be picked with % 10, which put a 0 or a 1 back in and defeated the
  // whole point of the alphabet.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const digits = "23456789";

  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const digit = digits[crypto.getRandomValues(new Uint8Array(1))[0] % digits.length];

  return `${body}#${digit}`;
}
