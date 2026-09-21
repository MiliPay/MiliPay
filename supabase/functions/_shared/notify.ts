/**
 * Outbound customer notifications — Termii SMS and Termii WhatsApp.
 *
 * Credentials are delivered to the customer's phone, never returned to the
 * caller and never rendered in a portal. `dispatchCredential` reports which
 * channel succeeded so the customer row can record it for support.
 */

const TERMII_SEND_URL = "https://api.ng.termii.com/api/sms/send";

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

async function sendViaTermii(
  channel: Channel,
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
    const response = await fetch(TERMII_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: termiiMsisdn(phone),
        from: senderId,
        sms: message,
        type: "plain",
        // Termii routes WhatsApp through the same endpoint by channel name.
        channel: channel === "whatsapp" ? "whatsapp" : "dnd",
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

/**
 * Try each configured channel in order and stop at the first success.
 *
 * Never throws: a failed dispatch must not roll back an approval that has
 * already minted an auth identity. The caller records the outcome and the
 * administrator can re-send.
 */
export async function dispatchCredential(
  phone: string,
  message: string,
): Promise<DispatchResult> {
  const attempts: DispatchResult["attempts"] = [];

  for (const channel of configuredChannels()) {
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
