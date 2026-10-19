import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller } from "../_shared/auth.ts";
import { consoleDeliveryAllowed } from "../_shared/notify.ts";
import { CHANNEL_UNAVAILABLE, pickChannel, sendCodeVia, type CodeChannel } from "../_shared/code-channels.ts";
import { pinRefusal } from "../_shared/login-code.ts";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_GAP_MS,
  allVerified,
  authPhone,
  channelsFor,
  codeFrom,
  displayPhone,
  emailSubject,
  emailText,
  nextChannel,
  requestClosed,
  smsMessage,
  validateContactChange,
  type Channel,
  type RequestState,
} from "../_shared/contact-change.ts";

/**
 * Changing a customer's email or phone number, by a code sent to the new one.
 *
 *   request  the customer's PIN first (someone holding an unlocked phone
 *            can't move the account to their own number), then validate and
 *            send a 6-digit code to each new address: email to the new
 *            email; SMS (the default), call or WhatsApp to the new number
 *   resend   a fresh code for one step, by the same or another phone
 *            channel (at most 3, 30 s apart)
 *   verify   check one code; when the last one is right, save the change —
 *            in Supabase Auth (a verified phone becomes the sign-in number)
 *            and on the customer's row
 *   cancel   the sheet was closed: nothing is saved
 *
 * Nothing about the account changes until every code is right. Codes are
 * stored only as an HMAC, live 10 minutes, and a request allows 5 wrong tries
 * in total. Everything is the caller's own: requests are looked up by the
 * authenticated user, never by an id alone.
 */

const TABLE = "contact_change_requests";

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[contact-change] rate limit check failed", error);
    return;
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

/** HMAC-SHA256 of the code, bound to its request and channel. */
async function codeHash(requestId: string, channel: Channel, code: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!secret) throw new ApiError("Codes are unavailable right now. Please try again later.", 503, "UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${requestId}:${channel}:${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Delivery ───────────────────────────────────────────────────────────────

/** The testing-only console channel, exactly as notify.ts allows it. */
function consoleDeliveryAllowed(): boolean {
  return (Deno.env.get("PASSWORD_DELIVERY_CHANNELS") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .includes("console");
}

async function sendEmailCode(to: string, code: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (apiKey && from) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: emailSubject(), text: emailText(code) }),
      });
      if (response.ok) return true;
      const body = await response.json().catch(() => ({}));
      console.error(`[contact-change] email not sent: HTTP ${response.status} ${String(body?.message ?? "")}`);
      return false;
    } catch (err) {
      console.error("[contact-change] email not sent", err);
      return false;
    }
  }
  if (consoleDeliveryAllowed()) {
    console.warn(
      "[contact-change] CONSOLE DELIVERY — code written to logs, not emailed.\n" +
        `  to: ${to}\n  code: ${code}`,
    );
    return true;
  }
  console.error("[contact-change] email not sent: RESEND_API_KEY or EMAIL_FROM is not set");
  return false;
}

/** How the code reaches the new number: phone channels only, since it proves the number. */
function phoneVia(value: unknown): CodeChannel {
  const via = pickChannel(value, "prove_phone", Deno.env, consoleDeliveryAllowed());
  if (!via) throw new ApiError(CHANNEL_UNAVAILABLE, 400, "CHANNEL_UNAVAILABLE");
  return via;
}

async function sendPhoneCode(localPhone: string, code: string, via: CodeChannel): Promise<boolean> {
  return await sendCodeVia(via, { phone: localPhone }, code, { text: smsMessage(code), subject: emailSubject() });
}

function deliver(channel: Channel, to: string, code: string, via: CodeChannel): Promise<boolean> {
  return channel === "email" ? sendEmailCode(to, code) : sendPhoneCode(to, code, via);
}

/** The PIN, with the same 5-try lock as payments. Throws unless it is right. */
async function requirePin(admin: SupabaseClient, userId: string, value: unknown) {
  const pin = typeof value === "string" ? value : "";
  if (!/^\d{4}$/.test(pin)) throw new ApiError("Enter your 4-digit PIN to change your contact details.", 400, "PIN_REQUIRED");
  const { data: result, error } = await admin.rpc("verify_customer_pin", { p_user_id: userId, p_pin: pin });
  if (error) {
    console.error("[contact-change] PIN check failed", error);
    throw new ApiError("Could not check your PIN. Please try again.", 503, "UNAVAILABLE");
  }
  if (!result?.valid) {
    throw new ApiError(pinRefusal(result ?? {}), result?.code === "PIN_LOCKED" ? 423 : 400, result?.code ?? "PIN_INCORRECT", {
      attemptsRemaining: result?.attemptsRemaining,
    });
  }
}

const NOT_SENT: Record<Channel, string> = {
  email: "We couldn't send a code to that email right now. Please try again shortly.",
  phone: "We couldn't send a code to that number right now. Please try again shortly.",
};

// ─── Requests ───────────────────────────────────────────────────────────────

interface RequestRow extends RequestState {
  id: string;
  user_id: string;
  customer_id: string | null;
  email_code_hash: string | null;
  phone_code_hash: string | null;
  email_sent_at: string | null;
  phone_sent_at: string | null;
  resends: number;
}

async function loadRequest(admin: SupabaseClient, userId: string, requestId: unknown): Promise<RequestRow> {
  // Looked up together with the caller's id below, so any string is safe to
  // try; one that is not a request of theirs is simply not found.
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) {
    throw new ApiError("Start again from your profile.", 400, "BAD_REQUEST");
  }
  const { data } = await admin.from(TABLE).select("*").eq("id", requestId).eq("user_id", userId).maybeSingle();
  if (!data) throw new ApiError("Start again from your profile.", 404, "NOT_FOUND");
  return data as RequestRow;
}

function channelOf(value: unknown): Channel {
  if (value === "email" || value === "phone") return value;
  throw new ApiError("Unknown code type.", 400, "BAD_REQUEST");
}

function targetOf(row: RequestRow, channel: Channel): string {
  const to = channel === "email" ? row.new_email : row.new_phone;
  if (!to) throw new ApiError("This change has no new " + channel + ".", 400, "BAD_REQUEST");
  return to;
}

async function request(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await rateLimit(admin, `contact-change:request:${userId}`, 5, 60 * 60);

  const { data: customer } = await admin
    .from("customers")
    .select("id, email, phone, status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!customer) throw new ApiError("Your profile could not be found.", 404, "CUSTOMER_NOT_FOUND");
  if (customer.status && customer.status !== "active") {
    throw new ApiError(`Your account is currently ${customer.status}.`, 403, "ACCOUNT_NOT_ACTIVE");
  }
  await requirePin(admin, userId, body.pin);
  const via = phoneVia(body.phoneVia);

  const checked = validateContactChange(
    { email: typeof body.email === "string" ? body.email : null, phone: typeof body.phone === "string" ? body.phone : null },
    { email: customer.email, phone: customer.phone },
  );
  if (!checked.ok) throw new ApiError(checked.error, 400, checked.code);
  const change = checked.change;

  // Someone else's number or email cannot be claimed, and gets no code.
  if (change.phone) {
    const { data: taken } = await admin
      .from("customers")
      .select("id")
      .eq("phone", change.phone)
      .neq("id", customer.id)
      .limit(1)
      .maybeSingle();
    if (taken) throw new ApiError("That number is already used by another MiliPay account.", 409, "CONTACT_TAKEN");
  }
  if (change.email) {
    const { data: taken } = await admin
      .from("customers")
      .select("id")
      .eq("email", change.email)
      .neq("id", customer.id)
      .limit(1)
      .maybeSingle();
    if (taken) throw new ApiError("That email is already used by another MiliPay account.", 409, "CONTACT_TAKEN");
  }

  // One change at a time: starting again replaces whatever was pending.
  const now = new Date();
  await admin
    .from(TABLE)
    .update({ cancelled_at: now.toISOString() })
    .eq("user_id", userId)
    .is("applied_at", null)
    .is("cancelled_at", null);

  const { data: created, error } = await admin
    .from(TABLE)
    .insert({
      user_id: userId,
      customer_id: customer.id,
      new_email: change.email,
      new_phone: change.phone,
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[contact-change] request not saved", error);
    throw new ApiError("Could not start this change. Please try again.", 503, "UNAVAILABLE");
  }

  const patch: Record<string, unknown> = {};
  for (const channel of channelsFor(change)) {
    const to = channel === "email" ? change.email! : change.phone!;
    const code = newCode();
    patch[`${channel}_code_hash`] = await codeHash(created.id, channel, code);
    patch[`${channel}_sent_at`] = new Date().toISOString();
    if (!(await deliver(channel, to, code, via))) {
      await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", created.id);
      throw new ApiError(NOT_SENT[channel], 503, "CODE_NOT_SENT", { channel });
    }
  }
  await admin.from(TABLE).update(patch).eq("id", created.id);

  return json({
    success: true,
    requestId: created.id,
    steps: channelsFor(change).map((channel) => ({
      channel,
      to: channel === "email" ? change.email : displayPhone(change.phone!),
    })),
  });
}

async function resend(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const row = await loadRequest(admin, userId, body.requestId);
  const closed = requestClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "REQUEST_CLOSED");

  const channel = channelOf(body.channel);
  const to = targetOf(row, channel);
  if (channel === "email" ? row.email_verified_at : row.phone_verified_at) {
    throw new ApiError("That one is already confirmed.", 400, "ALREADY_VERIFIED");
  }
  const resends = Number(row.resends) || 0;
  if (resends >= MAX_RESENDS) {
    throw new ApiError("You've asked for a new code too many times. Start again from your profile.", 429, "RESEND_LIMIT");
  }
  const lastSent = channel === "email" ? row.email_sent_at : row.phone_sent_at;
  if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before asking for another code.", 429, "RESEND_TOO_SOON");
  }

  const via = phoneVia(body.phoneVia);
  const code = newCode();
  if (!(await deliver(channel, to, code, via))) throw new ApiError(NOT_SENT[channel], 503, "CODE_NOT_SENT", { channel });
  await admin
    .from(TABLE)
    .update({
      [`${channel}_code_hash`]: await codeHash(row.id, channel, code),
      [`${channel}_sent_at`]: new Date().toISOString(),
      resends: resends + 1,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
    .eq("id", row.id);

  return json({ success: true });
}

async function apply(admin: SupabaseClient, userId: string, row: RequestRow) {
  // Supabase Auth first: it is the sign-in identity, and it refuses an email
  // or number another account already holds.
  const attributes: Record<string, unknown> = {};
  if (row.new_email) {
    attributes.email = row.new_email;
    attributes.email_confirm = true;
  }
  if (row.new_phone) {
    attributes.phone = authPhone(row.new_phone);
    attributes.phone_confirm = true;
  }
  const { error: authError } = await admin.auth.admin.updateUserById(userId, attributes);
  if (authError) {
    await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", row.id);
    const taken = /already|exists|registered|unique/i.test(authError.message ?? "");
    console.error("[contact-change] auth update refused", authError.message);
    throw taken
      ? new ApiError("That email or number is already used by another account.", 409, "CONTACT_TAKEN")
      : new ApiError("Could not save this change. Please try again.", 503, "UNAVAILABLE");
  }

  const customerPatch: Record<string, unknown> = {};
  // Proved by the code just checked: email sign-in and reset codes may go here.
  if (row.new_email) {
    customerPatch.email = row.new_email;
    customerPatch.email_verified_at = new Date().toISOString();
  }
  if (row.new_phone) customerPatch.phone = row.new_phone;
  const { error: customerError } = await admin.from("customers").update(customerPatch).eq("auth_user_id", userId);
  if (customerError) {
    // The sign-in identity already changed; the profile row must follow it.
    // Loud, because the two now disagree until someone re-runs this.
    console.error("[contact-change] CUSTOMER ROW NOT UPDATED after auth change", customerError);
    throw new ApiError("Your change was confirmed but not fully saved. Please contact support.", 500, "PARTIAL");
  }

  await admin.from(TABLE).update({ applied_at: new Date().toISOString() }).eq("id", row.id);
  return json({ success: true, done: true, email: row.new_email, phone: row.new_phone });
}

async function verify(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await rateLimit(admin, `contact-change:verify:${userId}`, 20, 60 * 60);
  const row = await loadRequest(admin, userId, body.requestId);
  const closed = requestClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "REQUEST_CLOSED");

  const channel = channelOf(body.channel);
  targetOf(row, channel);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter the 6-digit code.", 400, "BAD_CODE");

  const verifiedAt = channel === "email" ? row.email_verified_at : row.phone_verified_at;
  if (!verifiedAt) {
    const stored = channel === "email" ? row.email_code_hash : row.phone_code_hash;
    const given = await codeHash(row.id, channel, code);
    if (!stored || !sameHash(stored, given)) {
      const attempts = (Number(row.attempts) || 0) + 1;
      await admin
        .from(TABLE)
        .update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { cancelled_at: new Date().toISOString() } : {}) })
        .eq("id", row.id);
      if (attempts >= MAX_ATTEMPTS) {
        throw new ApiError("Too many wrong codes. Start again from your profile.", 410, "REQUEST_CLOSED");
      }
      throw new ApiError("That code isn't right. Check it and try again.", 400, "CODE_INCORRECT", {
        attemptsLeft: MAX_ATTEMPTS - attempts,
      });
    }
    const stamp = new Date().toISOString();
    await admin.from(TABLE).update({ [`${channel}_verified_at`]: stamp }).eq("id", row.id);
    if (channel === "email") row.email_verified_at = stamp;
    else row.phone_verified_at = stamp;
  }

  if (allVerified(row)) return apply(admin, userId, row);
  return json({ success: true, done: false, next: nextChannel(row) });
}

async function cancel(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const row = await loadRequest(admin, userId, body.requestId);
  if (!row.applied_at && !row.cancelled_at) {
    await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", row.id);
  }
  return json({ success: true });
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");

  const caller = await requireCaller(req);
  const admin = adminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "request") return request(admin, caller.id, body);
  if (action === "resend") return resend(admin, caller.id, body);
  if (action === "verify") return verify(admin, caller.id, body);
  if (action === "cancel") return cancel(admin, caller.id, body);
  throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
}));
