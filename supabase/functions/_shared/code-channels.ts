import { consoleDeliveryAllowed, sendEmail, sendTermii } from "./notify.ts";

/**
 * How a one-time code reaches someone: they pick SMS (the default), a voice
 * call, email or WhatsApp, among the ways that work right now and suit what
 * the code is for.
 *
 *   sign_in, password_reset  any channel; email only to a verified address
 *   prove_phone              phone channels only: the code proves the person
 *                            holds that number (sign-up, an agent's or admin's
 *                            phone check, a new number on Me)
 *   consent                  phone channels only: the account holder agrees
 *                            in front of an agent (Tier 2 upgrade)
 *
 * A channel is offered only once it is set up: Termii's voice route
 * (TERMII_VOICE=on), WhatsApp (TERMII_WHATSAPP=on, with a WhatsApp sender on
 * Termii), email (RESEND_API_KEY and EMAIL_FROM). SMS is always offered.
 * Where the testing-only console channel is on, every channel is offered and
 * anything that can't really be sent is written to the function log.
 */

export type CodeChannel = "sms" | "call" | "email" | "whatsapp";
export type CodePurpose = "sign_in" | "password_reset" | "prove_phone" | "consent";

export const CODE_CHANNELS: CodeChannel[] = ["sms", "call", "email", "whatsapp"];

export const PURPOSE_CHANNELS: Record<CodePurpose, CodeChannel[]> = {
  sign_in: ["sms", "call", "email", "whatsapp"],
  password_reset: ["sms", "call", "email", "whatsapp"],
  prove_phone: ["sms", "call", "whatsapp"],
  consent: ["sms", "call", "whatsapp"],
};

type Env = { get(key: string): string | undefined };

const on = (env: Env, key: string) => (env.get(key) ?? "").trim().toLowerCase() === "on";
const set = (env: Env, key: string) => (env.get(key) ?? "").trim().length > 0;

/** Which channels are switched on in this environment. SMS always is. */
export function enabledChannels(env: Env, consoleOn: boolean): CodeChannel[] {
  return CODE_CHANNELS.filter((c) => {
    if (c === "sms") return true;
    if (consoleOn && c !== "whatsapp") return true;
    if (c === "call") return on(env, "TERMII_VOICE");
    if (c === "whatsapp") return on(env, "TERMII_WHATSAPP");
    return set(env, "RESEND_API_KEY") && set(env, "EMAIL_FROM");
  });
}

/** The channels to offer for a purpose, in display order. */
export function channelsFor(purpose: CodePurpose, env: Env, consoleOn: boolean): CodeChannel[] {
  const enabled = enabledChannels(env, consoleOn);
  return PURPOSE_CHANNELS[purpose].filter((c) => enabled.includes(c));
}

/**
 * The channel the caller asked for, if it is allowed for this purpose and
 * switched on; SMS when they didn't say; null when they asked for one that
 * can't be used (the caller answers with a clear error).
 */
export function pickChannel(value: unknown, purpose: CodePurpose, env: Env, consoleOn: boolean): CodeChannel | null {
  if (value === undefined || value === null || value === "") return "sms";
  if (typeof value !== "string") return null;
  const c = value.trim().toLowerCase() as CodeChannel;
  return channelsFor(purpose, env, consoleOn).includes(c) ? c : null;
}

export const CHANNEL_UNAVAILABLE = "That way of getting a code isn't available. Choose another.";

/** "1 2 3, 4 5 6": read slowly and twice, so it can be written down. */
export function voiceText(code: string): string {
  const spoken = code.split("").join(" ");
  return `Your MiliPay code is ${spoken}. Again, your code is ${spoken}. MiliPay will never ask you for this code.`;
}

export interface CodeMessage {
  /** The SMS and WhatsApp text. */
  text: string;
  /** Email subject; the body is `text`. */
  subject: string;
}

/**
 * Sends a code once over the chosen channel. Never throws. Where the
 * console channel is on (testing only), a failed or unconfigured send is
 * written to the log instead, as notify.ts does for SMS.
 */
export async function sendCodeVia(
  channel: CodeChannel,
  to: { phone?: string | null; email?: string | null },
  code: string,
  message: CodeMessage,
): Promise<boolean> {
  let ok = false;
  let detail = "";
  if (channel === "email") {
    if (to.email) ok = await sendEmail(to.email, message.subject, message.text);
    detail = ok ? "" : "email not sent";
  } else if (to.phone) {
    const r = channel === "call"
      ? await sendTermii("voice", to.phone, voiceText(code))
      : await sendTermii(channel === "whatsapp" ? "whatsapp" : "sms", to.phone, message.text);
    ok = r.ok;
    detail = r.detail;
  }
  if (ok) return true;
  console.warn(`[code-channels] ${channel} not sent: ${detail || "no address"}`);
  if (consoleDeliveryAllowed()) {
    console.warn(
      `[code-channels] CONSOLE DELIVERY (${channel}) — code written to logs, not sent.\n` +
        `  to: ${channel === "email" ? to.email : to.phone}\n  message: ${message.text}`,
    );
    return true;
  }
  return false;
}

/** The ways a code can come right now, per purpose: for the app's chooser. */
export function channelMenu(env: Env, consoleOn: boolean): Record<CodePurpose, CodeChannel[]> {
  return {
    sign_in: channelsFor("sign_in", env, consoleOn),
    password_reset: channelsFor("password_reset", env, consoleOn),
    prove_phone: channelsFor("prove_phone", env, consoleOn),
    consent: channelsFor("consent", env, consoleOn),
  };
}
