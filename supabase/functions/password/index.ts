import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller } from "../_shared/auth.ts";
import { consoleDeliveryAllowed } from "../_shared/notify.ts";
import { CHANNEL_UNAVAILABLE, pickChannel, sendCodeVia, type CodeChannel } from "../_shared/code-channels.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import { loginPhone, sentTo } from "../_shared/login-code.ts";

/**
 * Me › Security › Change password (design handoff, screen 9b). Signed-in
 * callers only.
 *
 *   change         current + new password. The current one is checked with
 *                  Supabase Auth itself; a wrong one changes nothing.
 *   reset_request  "Forgot your current password?": a 6-digit code to the
 *                  number on this account (no other number) by SMS (the
 *                  default), call or WhatsApp, or to its verified email
 *   reset_resend   a fresh code, same or another channel (3 at most, 30 s apart)
 *   reset_verify   the code → a short-lived reset token
 *   reset          reset token + new password
 *
 * After any change every other session is signed out, so a password someone
 * else knew stops working everywhere at once.
 */

const TABLE = "password_resets";
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_GAP_MS = 30 * 1000;
const encoder = new TextEncoder();

/** The design's rules for a new password (the "different" rule needs the current one). */
export function newPasswordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/\d/.test(password)) return "Include at least one number.";
  if (password.length > 72) return "Use 72 characters or fewer.";
  return null;
}

async function hmac(message: string): Promise<string> {
  const s = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!s) throw new ApiError("This is unavailable right now. Please try again later.", 503, "UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", encoder.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
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
    console.error("[password] rate limit check failed", error);
    throw new ApiError("This is unavailable right now. Please try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Set the password, record it, and end every other session. */
async function setPassword(admin: SupabaseClient, userId: string, jwt: string, password: string) {
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error("[password] not changed", error.message);
    throw new ApiError("Could not change your password. Please try again.", 503, "UNAVAILABLE");
  }
  // password_changed_at is what sends "Your password was changed" to the inbox.
  await admin
    .from("customers")
    .update({ password_changed_at: new Date().toISOString(), must_change_password: false })
    .eq("auth_user_id", userId);
  const { error: signOutError } = await admin.auth.admin.signOut(jwt, "others");
  if (signOutError) console.error("[password] other sessions not signed out", signOutError.message);
}

async function change(admin: SupabaseClient, userId: string, email: string | null, jwt: string, body: Record<string, unknown>) {
  await rateLimit(admin, `password:change:${userId}`, 10, 60 * 60);
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.password === "string" ? body.password : "";
  const problem = newPasswordProblem(next);
  if (problem) throw new ApiError(problem, 400, "WEAK_PASSWORD");
  if (next === current) throw new ApiError("Choose a password different from your current one.", 400, "SAME_PASSWORD");
  if (!email) throw new ApiError("Could not check your current password. Please contact support.", 409, "NO_IDENTITY");

  // Ask Supabase Auth itself whether the current password is right.
  const check = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
    body: JSON.stringify({ email, password: current }),
  });
  if (!check.ok) throw new ApiError("That's not your current password.", 400, "WRONG_PASSWORD");

  await setPassword(admin, userId, jwt, next);
  return json({ success: true });
}

async function accountPhone(
  admin: SupabaseClient,
  userId: string,
): Promise<{ phone: string; customerId: string; email: string | null } | null> {
  const { data } = await admin.from("customers").select("id, phone, email, email_verified_at").eq("auth_user_id", userId).maybeSingle();
  if (!data?.phone) return null;
  // Email codes go only to an address the customer has proved is theirs.
  const email = data.email && data.email_verified_at ? String(data.email) : null;
  return { phone: String(data.phone), customerId: String(data.id), email };
}

function channelOf(value: unknown): CodeChannel {
  const channel = pickChannel(value, "password_reset", Deno.env, consoleDeliveryAllowed());
  if (!channel) throw new ApiError(CHANNEL_UNAVAILABLE, 400, "CHANNEL_UNAVAILABLE");
  return channel;
}

const NO_VERIFIED_EMAIL = "Your account has no verified email yet. Add one in Me › Contact details, or choose another way.";
const NOT_SENT = "We couldn't send a code that way right now. Please try again shortly, or choose another way.";

async function sendCode(channel: CodeChannel, to: { phone: string; email: string | null }, code: string): Promise<boolean> {
  const text = `Your MiliPay password reset code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this message.`;
  return await sendCodeVia(channel, to, code, { text, subject: "Your MiliPay password reset code" });
}

/** "+234 803 …" or the verified email, for "We sent a code to …". */
const sentToFor = (channel: CodeChannel, to: { phone: string; email: string | null }) =>
  channel === "email" && to.email ? to.email : sentTo(to.phone);

async function loadReset(admin: SupabaseClient, userId: string, id: unknown) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) throw new ApiError("Ask for a new code.", 400, "BAD_REQUEST");
  const { data } = await admin.from(TABLE).select("*").eq("id", id).eq("auth_user_id", userId).maybeSingle();
  if (!data) throw new ApiError("Ask for a new code.", 404, "NOT_FOUND");
  if (data.used_at || data.cancelled_at) throw new ApiError("Ask for a new code.", 410, "CLOSED");
  return data as Record<string, any>;
}

async function resetRequest(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const phone = loginPhone(body.phone);
  if (!phone) throw new ApiError("Enter the 10 digits after +234.", 400, "BAD_PHONE");
  await rateLimit(admin, `password:reset:${userId}`, 5, 60 * 60);
  const account = await accountPhone(admin, userId);
  if (!account) throw new ApiError("Your profile could not be found.", 404, "NOT_FOUND");
  if (account.phone !== phone) throw new ApiError("That's not the number on your account.", 400, "WRONG_PHONE");
  const channel = channelOf(body.channel);
  if (channel === "email" && !account.email) throw new ApiError(NO_VERIFIED_EMAIL, 400, "NO_VERIFIED_EMAIL");

  await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("auth_user_id", userId).is("used_at", null).is("cancelled_at", null);
  const { data: created, error } = await admin
    .from(TABLE)
    .insert({ auth_user_id: userId, customer_id: account.customerId, phone, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .select("id")
    .single();
  if (error || !created) throw new ApiError("Could not send a code. Please try again.", 503, "UNAVAILABLE");
  const code = codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!(await sendCode(channel, account, code))) {
    await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", created.id);
    throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  }
  await admin.from(TABLE).update({ code_hash: await hmac(`reset:${created.id}:${code}`), sent_at: new Date().toISOString() }).eq("id", created.id);
  return json({ success: true, requestId: created.id, channel, sentTo: sentToFor(channel, account) });
}

async function resetResend(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const row = await loadReset(admin, userId, body.requestId);
  if (row.verified_at) throw new ApiError("That code was already accepted.", 400, "ALREADY_VERIFIED");
  const resends = Number(row.resends) || 0;
  if (resends >= MAX_RESENDS) throw new ApiError("You've asked for a new code too many times. Start again.", 429, "RESEND_LIMIT");
  if (row.sent_at && Date.now() - new Date(row.sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before asking for another code.", 429, "RESEND_TOO_SOON");
  }
  const channel = channelOf(body.channel);
  const account = await accountPhone(admin, userId);
  if (!account) throw new ApiError("Your profile could not be found.", 404, "NOT_FOUND");
  if (channel === "email" && !account.email) throw new ApiError(NO_VERIFIED_EMAIL, 400, "NO_VERIFIED_EMAIL");
  const code = codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!(await sendCode(channel, { phone: row.phone, email: account.email }, code))) throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  await admin
    .from(TABLE)
    .update({
      code_hash: await hmac(`reset:${row.id}:${code}`),
      sent_at: new Date().toISOString(),
      resends: resends + 1,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
    .eq("id", row.id);
  return json({ success: true, channel, sentTo: sentToFor(channel, { phone: row.phone, email: account.email }) });
}

async function resetVerify(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await rateLimit(admin, `password:verify:${userId}`, 20, 60 * 60);
  const row = await loadReset(admin, userId, body.requestId);
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new ApiError("That code has expired. Ask for a new one.", 410, "CLOSED");
  const attempts = Number(row.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) throw new ApiError("Too many wrong codes. Ask for a new one.", 410, "CLOSED");
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter all 6 digits of the code.", 400, "BAD_CODE");
  if (!row.code_hash || !sameHash(row.code_hash, await hmac(`reset:${row.id}:${code}`))) {
    await admin
      .from(TABLE)
      .update({ attempts: attempts + 1, ...(attempts + 1 >= MAX_ATTEMPTS ? { cancelled_at: new Date().toISOString() } : {}) })
      .eq("id", row.id);
    if (attempts + 1 >= MAX_ATTEMPTS) throw new ApiError("Too many wrong codes. Ask for a new one.", 410, "CLOSED");
    throw new ApiError("That code isn't right. Check the SMS and try again.", 400, "CODE_INCORRECT");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await admin
    .from(TABLE)
    .update({
      verified_at: new Date().toISOString(),
      code_hash: null,
      token_hash: await hmac(`reset-token:${row.id}:${token}`),
      token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    })
    .eq("id", row.id);
  return json({ success: true, resetToken: token });
}

async function reset(admin: SupabaseClient, userId: string, jwt: string, body: Record<string, unknown>) {
  const row = await loadReset(admin, userId, body.requestId);
  const token = typeof body.resetToken === "string" ? body.resetToken : "";
  if (
    !row.verified_at ||
    !row.token_hash ||
    !token ||
    !sameHash(row.token_hash, await hmac(`reset-token:${row.id}:${token}`)) ||
    !row.token_expires_at ||
    new Date(row.token_expires_at).getTime() <= Date.now()
  ) {
    throw new ApiError("Ask for a new code.", 410, "CLOSED");
  }
  const next = typeof body.password === "string" ? body.password : "";
  const problem = newPasswordProblem(next);
  if (problem) throw new ApiError(problem, 400, "WEAK_PASSWORD");

  // Used first: one token, one change.
  const { data: claimed } = await admin
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) throw new ApiError("Ask for a new code.", 410, "CLOSED");

  await setPassword(admin, userId, jwt, next);
  return json({ success: true });
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  const jwt = bearer(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "change") return change(admin, caller.id, caller.email, jwt, body);
  if (action === "reset_request") return resetRequest(admin, caller.id, body);
  if (action === "reset_resend") return resetResend(admin, caller.id, body);
  if (action === "reset_verify") return resetVerify(admin, caller.id, body);
  if (action === "reset") return reset(admin, caller.id, jwt, body);
  throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
}));
