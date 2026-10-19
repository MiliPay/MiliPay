import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json } from "../_shared/auth.ts";
import { consoleDeliveryAllowed } from "../_shared/notify.ts";
import { CHANNEL_UNAVAILABLE, channelMenu, pickChannel, sendCodeVia, type CodeChannel } from "../_shared/code-channels.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_GAP_MS,
  awaitingPin,
  codeClosed,
  loginPhone,
  loginSms,
  pinRefusal,
  sentTo,
  signInRefusal,
  type LoginCodeState,
} from "../_shared/login-code.ts";

/**
 * Signing in with an SMS code (design handoff: "I've enrolled, log me in").
 *
 *   channels which ways a code can come right now (for the app's chooser)
 *   request  phone + channel -> a 6-digit code to that number by SMS (the
 *            default), call or WhatsApp, or to the account's verified email,
 *            if the number belongs to a verified customer
 *   resend   a fresh code, by the same or another channel (at most 3, 30 s apart)
 *   verify   check the code. First sign-in: a session is issued. An account
 *            that is already set up answers { step: "pin" } instead
 *   pin      the PIN, checked with the same 5-try lock as payments; then a
 *            session is issued
 *
 * Callers are not signed in, so this runs without a JWT. Everything is
 * rate-limited by phone and by address, codes are stored only as an HMAC and
 * live 10 minutes, and a code allows 5 wrong tries.
 *
 * The session: Supabase Auth issues it, not this function. A one-time
 * sign-in token is generated for the customer's own identity (no email is
 * sent) and handed back; the app exchanges it with supabase.auth.verifyOtp.
 *
 * Email is answered the same way whether or not the account has a verified
 * email ("if this account has one"), so the screen never tells a stranger
 * anything about someone else's account.
 */

const TABLE = "login_codes";

interface CodeRow extends LoginCodeState {
  id: string;
  customer_id: string;
  auth_user_id: string;
  phone: string;
  code_hash: string | null;
  sent_at: string | null;
  resends: number;
}

function callerAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Failing closed: an unmetered code endpoint is an SMS bill anyone can run up.
    console.error("[login-code] rate limit check failed", error);
    throw new ApiError("Logging in is unavailable right now. Please try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) {
    throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
  }
}

// ─── Codes ──────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function newCode(): string {
  return codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
}

/** HMAC-SHA256 of the code, bound to its row. */
async function codeHash(rowId: string, code: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!secret) throw new ApiError("Logging in is unavailable right now. Please try again later.", 503, "UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`login:${rowId}:${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const NOT_SENT = "We couldn't send a code that way right now. Please try again shortly, or choose another way.";
const EMAIL_SENT_TO = "your verified email, if this account has one";

function channelOf(value: unknown): CodeChannel {
  const channel = pickChannel(value, "sign_in", Deno.env, consoleDeliveryAllowed());
  if (!channel) throw new ApiError(CHANNEL_UNAVAILABLE, 400, "CHANNEL_UNAVAILABLE");
  return channel;
}

/** The customer's email, only once they have proved it (Me › Contact details). */
async function verifiedEmail(admin: SupabaseClient, customerId: string): Promise<string | null> {
  const { data } = await admin.from("customers").select("email, email_verified_at").eq("id", customerId).maybeSingle();
  return data?.email && data?.email_verified_at ? String(data.email) : null;
}

/**
 * Sends the code. For email with no verified address nothing is sent, and
 * the answer is the same as when it is: true ("handled").
 */
async function sendCode(admin: SupabaseClient, channel: CodeChannel, customerId: string, phone: string, code: string): Promise<boolean> {
  if (channel === "email") {
    const email = await verifiedEmail(admin, customerId);
    if (!email) return true;
    return sendCodeVia("email", { email }, code, { text: loginSms(code), subject: "Your MiliPay login code" });
  }
  return sendCodeVia(channel, { phone }, code, { text: loginSms(code), subject: "Your MiliPay login code" });
}

const sentToFor = (channel: CodeChannel, phone: string) => (channel === "email" ? EMAIL_SENT_TO : sentTo(phone));

async function loadRow(admin: SupabaseClient, requestId: unknown): Promise<CodeRow> {
  // A random uuid the caller was given for this code; any other string is
  // simply not found.
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) {
    throw new ApiError("Ask for a new code.", 400, "BAD_REQUEST");
  }
  const { data } = await admin.from(TABLE).select("*").eq("id", requestId).maybeSingle();
  if (!data) throw new ApiError("Ask for a new code.", 404, "NOT_FOUND");
  return data as CodeRow;
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function request(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  const phone = loginPhone(body.phone);
  if (!phone) throw new ApiError("Enter the 11-digit number you registered with.", 400, "BAD_PHONE");
  const channel = channelOf(body.channel);

  await rateLimit(admin, `login-code:address:${address}`, 20, 60 * 60);
  await rateLimit(admin, `login-code:phone:${phone}`, 5, 60 * 60);

  const { data: matches } = await admin
    .from("customers")
    .select("id, auth_user_id, status, pin_hash, onboarding_completed_at")
    .eq("phone", phone)
    .limit(2);
  const rows = (matches ?? []) as Array<Record<string, any>>;
  if (rows.length > 1) {
    console.error("[login-code] more than one customer has this phone; refusing");
    throw new ApiError("This number can't log in right now. Please contact support@milipay.ng.", 409, "AMBIGUOUS");
  }
  const customer = rows[0] ?? null;
  const refusal = signInRefusal(customer as any);
  if (refusal) throw new ApiError(refusal.error, refusal.status, refusal.code);

  // One live code per customer: asking again replaces the last one.
  const now = new Date();
  await admin
    .from(TABLE)
    .update({ cancelled_at: now.toISOString() })
    .eq("customer_id", customer!.id)
    .is("consumed_at", null)
    .is("cancelled_at", null);

  const { data: created, error } = await admin
    .from(TABLE)
    .insert({
      customer_id: customer!.id,
      auth_user_id: customer!.auth_user_id,
      phone,
      needs_pin: Boolean(customer!.pin_hash) && Boolean(customer!.onboarding_completed_at),
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[login-code] code not saved", error);
    throw new ApiError("Could not send a code. Please try again.", 503, "UNAVAILABLE");
  }

  const code = newCode();
  const hash = await codeHash(created.id, code);
  if (!(await sendCode(admin, channel, customer!.id, phone, code))) {
    await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", created.id);
    throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  }
  await admin.from(TABLE).update({ code_hash: hash, sent_at: new Date().toISOString() }).eq("id", created.id);

  return json({ success: true, requestId: created.id, channel, sentTo: sentToFor(channel, phone) });
}

async function resend(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  await rateLimit(admin, `login-code:address:${address}`, 20, 60 * 60);
  const row = await loadRow(admin, body.requestId);
  const closed = codeClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (row.code_verified_at) throw new ApiError("That code was already accepted.", 400, "ALREADY_VERIFIED");

  const resends = Number(row.resends) || 0;
  if (resends >= MAX_RESENDS) {
    throw new ApiError("You've asked for a new code too many times. Go back and start again.", 429, "RESEND_LIMIT");
  }
  if (row.sent_at && Date.now() - new Date(row.sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before asking for another code.", 429, "RESEND_TOO_SOON");
  }

  const channel = channelOf(body.channel);
  const code = newCode();
  if (!(await sendCode(admin, channel, row.customer_id, row.phone, code))) throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  await admin
    .from(TABLE)
    .update({
      code_hash: await codeHash(row.id, code),
      sent_at: new Date().toISOString(),
      resends: resends + 1,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
    .eq("id", row.id);

  return json({ success: true, channel, sentTo: sentToFor(channel, row.phone) });
}

/** Hand back a one-time sign-in token for the customer's own identity. */
async function issueSession(admin: SupabaseClient, row: CodeRow) {
  // Marked used first: a token is never issued twice for one code.
  const { data: claimed } = await admin
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) throw new ApiError("This code has already been used. Ask for a new one.", 410, "CODE_CLOSED");

  const { data: found, error: userError } = await admin.auth.admin.getUserById(row.auth_user_id);
  const email = found?.user?.email;
  if (userError || !email) {
    console.error("[login-code] sign-in identity has no email", userError?.message);
    throw new ApiError("This account can't log in by code yet. Please contact support@milipay.ng.", 409, "NO_IDENTITY");
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = (link as any)?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("[login-code] sign-in token not issued", linkError?.message);
    throw new ApiError("Could not log you in. Please try again.", 503, "UNAVAILABLE");
  }

  return json({ success: true, step: "session", tokenHash });
}

async function verify(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  await rateLimit(admin, `login-code:verify:${address}`, 30, 60 * 60);
  const row = await loadRow(admin, body.requestId);
  const now = new Date();
  const closed = codeClosed(row, now);
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter all 6 digits of the code.", 400, "BAD_CODE");

  if (!row.code_verified_at) {
    const given = await codeHash(row.id, code);
    if (!row.code_hash || !sameHash(row.code_hash, given)) {
      const attempts = (Number(row.attempts) || 0) + 1;
      await admin
        .from(TABLE)
        .update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { cancelled_at: new Date().toISOString() } : {}) })
        .eq("id", row.id);
      if (attempts >= MAX_ATTEMPTS) throw new ApiError("Too many wrong codes. Ask for a new one.", 410, "CODE_CLOSED");
      throw new ApiError("That code isn't right. Check it and try again.", 400, "CODE_INCORRECT", {
        attemptsLeft: MAX_ATTEMPTS - attempts,
      });
    }
    row.code_verified_at = now.toISOString();
    await admin.from(TABLE).update({ code_verified_at: row.code_verified_at }).eq("id", row.id);
  }

  if (row.needs_pin) return json({ success: true, step: "pin" });
  return issueSession(admin, row);
}

async function pin(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  await rateLimit(admin, `login-code:pin:${address}`, 20, 60 * 60);
  const row = await loadRow(admin, body.requestId);
  const now = new Date();
  const closed = codeClosed(row, now);
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (!awaitingPin(row, now)) throw new ApiError("Ask for a new code.", 410, "CODE_CLOSED");

  const given = typeof body.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(given)) throw new ApiError("Enter your 4-digit PIN.", 400, "BAD_PIN");

  const { data: result, error } = await admin.rpc("verify_customer_pin", { p_user_id: row.auth_user_id, p_pin: given });
  if (error) {
    console.error("[login-code] PIN check failed", error);
    throw new ApiError("Could not check your PIN. Please try again.", 503, "UNAVAILABLE");
  }
  if (!result?.valid) {
    if (result?.code === "PIN_LOCKED") {
      await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", row.id);
    }
    throw new ApiError(pinRefusal(result ?? {}), result?.code === "PIN_LOCKED" ? 423 : 400, result?.code ?? "PIN_INCORRECT", {
      attemptsRemaining: result?.attemptsRemaining,
    });
  }

  return issueSession(admin, row);
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");

  const admin = adminClient();
  const address = callerAddress(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "channels") return json({ success: true, channels: channelMenu(Deno.env, consoleDeliveryAllowed()) });
  if (action === "request") return request(admin, address, body);
  if (action === "resend") return resend(admin, address, body);
  if (action === "verify") return verify(admin, address, body);
  if (action === "pin") return pin(admin, address, body);
  throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
}));
