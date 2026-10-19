import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller, type Caller } from "../_shared/auth.ts";
import { consoleDeliveryAllowed } from "../_shared/notify.ts";
import { CHANNEL_UNAVAILABLE, channelsFor, pickChannel, sendCodeVia, type CodeChannel } from "../_shared/code-channels.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import { loginPhone } from "../_shared/login-code.ts";

/**
 * The merchant portal's second step (agreed 2026-10-20). After the password,
 * a 6-digit code to the account's own phone (SMS or a call; WhatsApp once
 * on) or its sign-in email. Until this sign-in session has passed it, the
 * database shows the merchant nothing (merchant_second_step_ok, migration
 * 20261020110000).
 *
 *   status   is a code needed for this session, and which ways it can come
 *   request  channel -> a code
 *   resend   requestId, channel -> a fresh code (at most 3, 30 s apart)
 *   verify   requestId, code -> this session passes
 *
 * Codes are stored only as an HMAC bound to their row, live 10 minutes and
 * allow 5 wrong tries. Everything is the caller's own session.
 */

const TABLE = "merchant_sign_in_codes";
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_GAP_MS = 30_000;
const NOT_SENT = "We couldn't send the code that way right now. Try again shortly, or choose another way.";

const enc = new TextEncoder();

async function hmac(message: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!secret) throw new ApiError("Signing in is unavailable right now.", 503, "UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[merchant-code] rate limit check failed", error);
    throw new ApiError("Signing in is unavailable right now. Try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Wait a while and try again.", 429, "RATE_LIMITED");
}

/** "+234 ••• ••• 4567" */
export function maskPhone(local: string): string {
  return `+234 ••• ••• ${local.slice(-4)}`;
}

/** "a•••@lekkifresh.ng" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return domain ? `${user.slice(0, 1)}•••@${domain}` : "your email";
}

interface MerchantContact {
  id: string;
  phone: string | null;
  email: string | null;
}

async function merchantOf(admin: SupabaseClient, caller: Caller): Promise<MerchantContact | null> {
  const { data } = await admin.from("merchants").select("id, director_phone, email").eq("auth_user_id", caller.id).limit(1).maybeSingle();
  if (!data) return null;
  return { id: String(data.id), phone: loginPhone(data.director_phone), email: data.email ? String(data.email) : caller.email };
}

function needSession(caller: Caller): string {
  if (!caller.sessionId) throw new ApiError("Sign in again.", 401, "NO_SESSION");
  return caller.sessionId;
}

/** The ways on offer for this merchant: email only when there is one, phone ways only with a phone. */
function offered(m: MerchantContact): CodeChannel[] {
  return channelsFor("sign_in", Deno.env, consoleDeliveryAllowed()).filter((c) => (c === "email" ? Boolean(m.email) : Boolean(m.phone)));
}

function channelOf(value: unknown, m: MerchantContact): CodeChannel {
  const c = pickChannel(value, "sign_in", Deno.env, consoleDeliveryAllowed());
  if (!c || !offered(m).includes(c)) throw new ApiError(CHANNEL_UNAVAILABLE, 400, "CHANNEL_UNAVAILABLE");
  return c;
}

const sentToFor = (c: CodeChannel, m: MerchantContact) => (c === "email" ? maskEmail(m.email ?? "") : maskPhone(m.phone ?? ""));

async function send(rowId: string, c: CodeChannel, m: MerchantContact): Promise<string> {
  const code = codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
  const text = `Your MiliPay merchant sign-in code is ${code}. It expires in 10 minutes. MiliPay will never ask you for it.`;
  if (!(await sendCodeVia(c, { phone: m.phone, email: m.email }, code, { text, subject: "Your MiliPay sign-in code" }))) {
    throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  }
  return hmac(`merchant-code:${rowId}:${code}`);
}

async function status(admin: SupabaseClient, caller: Caller) {
  const m = await merchantOf(admin, caller);
  if (!m) return json({ success: true, required: false, passed: true });
  const session = needSession(caller);
  const { data } = await admin.from(TABLE).select("id, verified_at").eq("user_id", caller.id).eq("session_id", session);
  return json({
    success: true,
    required: true,
    passed: (data ?? []).some((r: { verified_at: string | null }) => Boolean(r.verified_at)),
    channels: offered(m),
    phone: m.phone ? maskPhone(m.phone) : null,
    email: m.email ? maskEmail(m.email) : null,
  });
}

async function request(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const m = await merchantOf(admin, caller);
  if (!m) throw new ApiError("This isn't a merchant account.", 403, "NOT_MERCHANT");
  const session = needSession(caller);
  const c = channelOf(body.channel, m);
  await rateLimit(admin, `merchant-code:user:${caller.id}`, 10, 3600);

  await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("user_id", caller.id).eq("session_id", session).is("verified_at", null).is("cancelled_at", null);
  const { data: row, error } = await admin
    .from(TABLE)
    .insert({ user_id: caller.id, merchant_id: m.id, session_id: session, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .select("id")
    .single();
  if (error || !row) throw new ApiError("Couldn't send a code. Try again.", 503, "UNAVAILABLE");
  const hash = await send(row.id, c, m);
  await admin.from(TABLE).update({ code_hash: hash, sent_at: new Date().toISOString() }).eq("id", row.id);
  return json({ success: true, requestId: row.id, channel: c, sentTo: sentToFor(c, m) });
}

async function loadRow(admin: SupabaseClient, caller: Caller, id: unknown) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) throw new ApiError("Ask for a new code.", 400, "BAD_REQUEST");
  const { data } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
  // Only the session that asked can use it.
  if (!data || data.user_id !== caller.id || data.session_id !== caller.sessionId) throw new ApiError("Ask for a new code.", 404, "NOT_FOUND");
  if (data.verified_at) throw new ApiError("That code was already accepted.", 400, "ALREADY_VERIFIED");
  if (data.cancelled_at) throw new ApiError("This code is no longer valid. Ask for a new one.", 410, "CODE_CLOSED");
  if (new Date(data.expires_at).getTime() <= Date.now()) throw new ApiError("That code has expired. Ask for a new one.", 410, "CODE_CLOSED");
  return data as Record<string, any>;
}

async function resend(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const m = await merchantOf(admin, caller);
  if (!m) throw new ApiError("This isn't a merchant account.", 403, "NOT_MERCHANT");
  const row = await loadRow(admin, caller, body.requestId);
  const resends = Number(row.resends) || 0;
  if (resends >= MAX_RESENDS) throw new ApiError("You've asked for a new code too many times. Sign in again.", 429, "RESEND_LIMIT");
  if (row.sent_at && Date.now() - new Date(row.sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before asking for another code.", 429, "RESEND_TOO_SOON");
  }
  const c = channelOf(body.channel, m);
  const hash = await send(row.id, c, m);
  await admin
    .from(TABLE)
    .update({ code_hash: hash, sent_at: new Date().toISOString(), resends: resends + 1, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .eq("id", row.id);
  return json({ success: true, channel: c, sentTo: sentToFor(c, m) });
}

async function verify(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  await rateLimit(admin, `merchant-code:verify:${caller.id}`, 30, 3600);
  const row = await loadRow(admin, caller, body.requestId);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter all 6 digits of the code.", 400, "BAD_CODE");
  if (!row.code_hash || !sameHash(row.code_hash, await hmac(`merchant-code:${row.id}:${code}`))) {
    const attempts = (Number(row.attempts) || 0) + 1;
    await admin.from(TABLE).update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", row.id);
    if (attempts >= MAX_ATTEMPTS) throw new ApiError("Too many wrong codes. Ask for a new one.", 410, "CODE_CLOSED");
    throw new ApiError("That code isn't right. Check it and try again.", 400, "CODE_INCORRECT", { attemptsLeft: MAX_ATTEMPTS - attempts });
  }
  await admin.from(TABLE).update({ verified_at: new Date().toISOString() }).eq("id", row.id).is("verified_at", null);
  return json({ success: true, passed: true });
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  switch (body.action) {
    case "status":
      return status(admin, caller);
    case "request":
      return request(admin, caller, body);
    case "resend":
      return resend(admin, caller, body);
    case "verify":
      return verify(admin, caller, body);
    default:
      throw new ApiError(`Unknown action: ${String(body.action)}`, 400, "UNKNOWN_ACTION");
  }
}));
