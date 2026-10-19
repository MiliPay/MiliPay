import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole, type Caller } from "../_shared/auth.ts";
import { recordAudit } from "../_shared/audit.ts";
import { consoleDeliveryAllowed } from "../_shared/notify.ts";
import { CHANNEL_UNAVAILABLE, pickChannel, sendCodeVia, type CodeChannel, type CodePurpose } from "../_shared/code-channels.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import {
  CODE_TTL_MS,
  MAX_RESENDS,
  RESEND_GAP_MS,
  captureClosed,
  codeClosed,
  localPhone,
  maskedPhone,
  phoneCheckSms,
  upgradeRefusal,
  upgradeSms,
  type UpgradeCodeState,
} from "../_shared/agent-upgrade.ts";

/**
 * Upgrade to Tier 2 (agent portal). An agent, signed in past their second
 * factor, moves a Tier 1 self sign-up to Tier 2 by capturing their palm:
 *
 *   request   customerId + channel -> a 6-digit code to the customer's phone
 *             by SMS (the default), call or WhatsApp
 *   resend    a fresh code, same or another channel (at most 3, 30 s apart)
 *   verify    the code the customer reads out; 5 wrong tries closes it
 *   complete  the palm capture (within 15 minutes of the code) -> Tier 2,
 *             upgraded_by = the agent. Audited.
 *   resubmit  Fix and resubmit: the registering agent recaptures the palm
 *             and/or face of a declined customer -> Pending review. Audited.
 *   phone_request / phone_resend / phone_verify
 *             Register customer, step 1: text a code to a new customer's
 *             phone; enrol-customer then needs the confirmed check.
 *
 * Codes are stored only as an HMAC bound to their row.
 */

const TABLE = "agent_upgrade_codes";

interface CodeRow extends UpgradeCodeState {
  id: string;
  customer_id: string;
  agent_id: string;
  phone: string;
  code_hash: string | null;
  sent_at: string | null;
  resends: number;
}

const SIMULATED_PALM_PREFIXES = ["SIMULATED-PVT-", "PVT-mock-hash-"];

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[agent-upgrade] rate limit check failed", error);
    throw new ApiError("Upgrades are unavailable right now. Please try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
}

const encoder = new TextEncoder();

async function codeHash(rowId: string, code: string, scope = "agent-upgrade"): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!secret) throw new ApiError("Upgrades are unavailable right now.", 503, "UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${scope}:${rowId}:${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const newCode = () => codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);

async function agentName(admin: SupabaseClient, caller: Caller): Promise<string> {
  const { data } = await admin.from("staff_profiles").select("full_name").eq("id", caller.id).maybeSingle();
  return data?.full_name ?? "Your agent";
}

async function loadCustomer(admin: SupabaseClient, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("Pick a customer to upgrade.", 400, "BAD_REQUEST");
  const { data } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, status, kyc_tier, nin_verified, has_palm_template")
    .eq("id", id)
    .maybeSingle();
  return data as Record<string, any> | null;
}

/** The agent's own code row; anyone else's is simply not found. */
async function loadRow(admin: SupabaseClient, caller: Caller, requestId: unknown): Promise<CodeRow> {
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) {
    throw new ApiError("Send the customer a new code.", 400, "BAD_REQUEST");
  }
  const { data } = await admin.from(TABLE).select("*").eq("id", requestId).maybeSingle();
  if (!data || data.agent_id !== caller.id) throw new ApiError("Send the customer a new code.", 404, "NOT_FOUND");
  return data as CodeRow;
}

/** The customer picks: SMS (the default), call or WhatsApp. Never email: the code proves the phone. */
function channelOf(value: unknown, purpose: CodePurpose): CodeChannel {
  const channel = pickChannel(value, purpose, Deno.env, consoleDeliveryAllowed());
  if (!channel) throw new ApiError(CHANNEL_UNAVAILABLE, 400, "CHANNEL_UNAVAILABLE");
  return channel;
}

async function sendCode(admin: SupabaseClient, caller: Caller, row: { id: string; phone: string }, via: CodeChannel) {
  const code = newCode();
  const sent = await sendCodeVia(via, { phone: row.phone }, code, {
    text: upgradeSms(code, await agentName(admin, caller)),
    subject: "Your MiliPay upgrade code",
  });
  if (!sent) {
    throw new ApiError("We couldn't send the customer a code that way right now. Try again shortly, or choose another way.", 503, "CODE_NOT_SENT");
  }
  return codeHash(row.id, code);
}

async function request(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  await rateLimit(admin, `agent-upgrade:agent:${caller.id}`, 30, 60 * 60);
  const via = channelOf(body.channel, "consent");
  const customer = await loadCustomer(admin, body.customerId);
  const refusal = upgradeRefusal(customer as any);
  if (refusal) throw new ApiError(refusal.error, refusal.status, refusal.code);
  await rateLimit(admin, `agent-upgrade:customer:${customer!.id}`, 5, 60 * 60);

  const now = new Date();
  await admin.from(TABLE).update({ cancelled_at: now.toISOString() }).eq("customer_id", customer!.id).is("consumed_at", null).is("cancelled_at", null);
  const { data: created, error } = await admin
    .from(TABLE)
    .insert({
      customer_id: customer!.id,
      agent_id: caller.id,
      phone: customer!.phone,
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      resends: 0,
      attempts: 0,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[agent-upgrade] code not saved", error);
    throw new ApiError("Could not send a code. Please try again.", 503, "UNAVAILABLE");
  }
  let hash: string;
  try {
    hash = await sendCode(admin, caller, { id: created.id, phone: customer!.phone }, via);
  } catch (err) {
    await admin.from(TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", created.id);
    throw err;
  }
  await admin.from(TABLE).update({ code_hash: hash, sent_at: new Date().toISOString() }).eq("id", created.id);
  return json({ success: true, requestId: created.id, sentTo: maskedPhone(customer!.phone) });
}

async function resend(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const row = await loadRow(admin, caller, body.requestId);
  const closed = codeClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (row.code_verified_at) throw new ApiError("That code was already accepted.", 400, "ALREADY_VERIFIED");
  if ((row.resends ?? 0) >= MAX_RESENDS) throw new ApiError("Too many new codes. Go back and start again.", 429, "RESEND_LIMIT");
  if (row.sent_at && Date.now() - new Date(row.sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before sending another code.", 429, "RESEND_TOO_SOON");
  }
  const hash = await sendCode(admin, caller, row, channelOf(body.channel, "consent"));
  await admin
    .from(TABLE)
    .update({ code_hash: hash, sent_at: new Date().toISOString(), resends: (row.resends ?? 0) + 1, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .eq("id", row.id);
  return json({ success: true, sentTo: maskedPhone(row.phone) });
}

async function verify(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const row = await loadRow(admin, caller, body.requestId);
  const closed = codeClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (row.code_verified_at) return json({ success: true });
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!row.code_hash || code.length !== 6 || !sameHash(row.code_hash, await codeHash(row.id, code))) {
    await admin.from(TABLE).update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
    throw new ApiError("That code isn't right. Ask the customer to read it again.", 400, "WRONG_CODE");
  }
  await admin.from(TABLE).update({ code_verified_at: new Date().toISOString() }).eq("id", row.id);
  return json({ success: true });
}

async function complete(admin: SupabaseClient, req: Request, caller: Caller, body: Record<string, unknown>) {
  const row = await loadRow(admin, caller, body.requestId);
  const closed = captureClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");

  const template = typeof body.palmVeinTemplate === "string" ? body.palmVeinTemplate.trim() : "";
  const quality = typeof body.quality === "number" ? body.quality : 0;
  if (!template) throw new ApiError("Capture the customer's palm first.", 400, "NO_CAPTURE");
  if (quality < 70) throw new ApiError("That palm scan wasn't clear enough. Scan again.", 400, "LOW_QUALITY");
  const simulated = SIMULATED_PALM_PREFIXES.some((p) => template.startsWith(p));
  if (simulated && Deno.env.get("ALLOW_SIMULATED_BIOMETRICS") !== "true") {
    throw new ApiError(
      "This capture was simulated and cannot be used. Connect the enrolment hardware and capture again.",
      400,
      "SIMULATED_BIOMETRIC_REJECTED",
    );
  }

  // Check again: the customer may have changed since the code was sent.
  const customer = await loadCustomer(admin, row.customer_id);
  const refusal = upgradeRefusal(customer as any);
  if (refusal) throw new ApiError(refusal.error, refusal.status, refusal.code);

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("customers")
    .update({ palm_vein_template: template, palm_simulated: simulated, kyc_tier: 2, upgraded_by: caller.id, upgraded_at: now })
    .eq("id", customer!.id)
    .eq("kyc_tier", 1)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    console.error("[agent-upgrade] customer not upgraded", error);
    throw new ApiError("Could not finish the upgrade. Please try again.", 409, "UPGRADE_FAILED");
  }
  await admin.from(TABLE).update({ consumed_at: now }).eq("id", row.id);

  const name = `${customer!.first_name ?? ""} ${customer!.last_name ?? ""}`.trim();
  await recordAudit(admin, req, caller, {
    category: "Customers",
    action: "upgraded to Tier 2",
    target: name || maskedPhone(customer!.phone),
    targetId: customer!.id,
    before: { kycTier: 1 },
    after: { kycTier: 2, palmSimulated: simulated },
    result: "success",
  });
  return json({ success: true, customerId: customer!.id, tier: 2, maxSingle: 150_000, maxDaily: 500_000 });
}

/**
 * Fix and resubmit (handoff screen 7): the agent who registered a declined
 * customer recaptures what admin flagged, the palm, the face or both, and
 * the registration goes back to Pending review.
 */
async function resubmit(admin: SupabaseClient, req: Request, caller: Caller, body: Record<string, unknown>) {
  const id = typeof body.customerId === "string" ? body.customerId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("Pick a registration to fix.", 400, "BAD_REQUEST");
  const { data: c } = await admin
    .from("customers")
    .select("id, first_name, last_name, status, registered_by, rejection_reason")
    .eq("id", id)
    .maybeSingle();
  if (!c || c.registered_by !== caller.id) throw new ApiError("That registration wasn't found.", 404, "NOT_FOUND");
  if (c.status !== "rejected") throw new ApiError("Only declined registrations can be fixed.", 409, "NOT_DECLINED");

  const palm = typeof body.palmVeinTemplate === "string" ? body.palmVeinTemplate.trim() : "";
  const face = typeof body.faceTemplate === "string" ? body.faceTemplate.trim() : "";
  if (!palm && !face) throw new ApiError("Recapture the palm or the face first.", 400, "NO_CAPTURE");
  if (palm && (typeof body.palmQuality !== "number" || body.palmQuality < 70)) {
    throw new ApiError("That palm scan wasn't clear enough. Scan again.", 400, "LOW_QUALITY");
  }
  if (face && (typeof body.faceQuality !== "number" || body.faceQuality < 70)) {
    throw new ApiError("That face photo wasn't clear enough. Take it again.", 400, "LOW_QUALITY");
  }
  const palmSimulated = SIMULATED_PALM_PREFIXES.some((p) => palm.startsWith(p));
  const faceSimulated = face.startsWith("SIMULATED-FACE-");
  if (((palm && palmSimulated) || (face && faceSimulated)) && Deno.env.get("ALLOW_SIMULATED_BIOMETRICS") !== "true") {
    throw new ApiError(
      "This capture was simulated and cannot be used. Connect the enrolment hardware and capture again.",
      400,
      "SIMULATED_BIOMETRIC_REJECTED",
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: "pending", rejection_reason: null, verified_by: null, verified_at: null };
  if (palm) Object.assign(patch, { palm_vein_template: palm, palm_simulated: palmSimulated });
  if (face) Object.assign(patch, { face_template: face, face_simulated: faceSimulated, face_captured_at: now });
  const { data: updated, error } = await admin.from("customers").update(patch).eq("id", c.id).eq("status", "rejected").select("id").maybeSingle();
  if (error || !updated) {
    console.error("[agent-upgrade] resubmit failed", error);
    throw new ApiError("Could not resubmit. Please try again.", 409, "RESUBMIT_FAILED");
  }
  await recordAudit(admin, req, caller, {
    category: "Customers",
    action: "resubmitted a declined registration",
    target: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null,
    targetId: c.id,
    before: { status: "rejected", reason: c.rejection_reason },
    after: { status: "pending", recaptured: [palm && "palm", face && "face"].filter(Boolean) },
    result: "success",
  });
  return json({ success: true, status: "pending" });
}

// ── Register customer: check the phone with an SMS code ─────────────────────

const PHONE_TABLE = "agent_phone_checks";

async function loadPhoneCheck(admin: SupabaseClient, caller: Caller, checkId: unknown): Promise<CodeRow> {
  if (typeof checkId !== "string" || checkId.length === 0 || checkId.length > 64) {
    throw new ApiError("Send the customer a new code.", 400, "BAD_REQUEST");
  }
  const { data } = await admin.from(PHONE_TABLE).select("*").eq("id", checkId).maybeSingle();
  if (!data || data.agent_id !== caller.id) throw new ApiError("Send the customer a new code.", 404, "NOT_FOUND");
  return data as CodeRow;
}

async function sendPhoneCode(rowId: string, phone: string, via: CodeChannel): Promise<string> {
  const code = newCode();
  const sent = await sendCodeVia(via, { phone }, code, { text: phoneCheckSms(code), subject: "Your MiliPay code" });
  if (!sent) {
    throw new ApiError("We couldn't send a code to that number that way right now. Check it, or choose another way.", 503, "CODE_NOT_SENT");
  }
  return codeHash(rowId, code, "phone-check");
}

async function phoneRequest(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const phone = localPhone(body.phone);
  if (!phone) throw new ApiError("Enter the customer's 11-digit phone number.", 400, "BAD_PHONE");
  const via = channelOf(body.channel, "prove_phone");
  await rateLimit(admin, `agent-phone:agent:${caller.id}`, 40, 60 * 60);
  await rateLimit(admin, `agent-phone:phone:${phone}`, 5, 60 * 60);

  // Phones are stored as 0803… or +234803…; either means already registered.
  const { data: taken } = await admin.from("customers").select("id").in("phone", [phone, `+234${phone.slice(1)}`]).limit(1);
  if ((taken ?? []).length > 0) {
    throw new ApiError("This phone number is already registered with MiliPay. Use Find customer.", 409, "PHONE_ALREADY_ENROLLED");
  }

  const now = new Date();
  await admin.from(PHONE_TABLE).update({ cancelled_at: now.toISOString() }).eq("phone", phone).is("consumed_at", null).is("cancelled_at", null);
  const { data: created, error } = await admin
    .from(PHONE_TABLE)
    .insert({ agent_id: caller.id, phone, expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(), resends: 0, attempts: 0 })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[agent-upgrade] phone check not saved", error);
    throw new ApiError("Could not send a code. Please try again.", 503, "UNAVAILABLE");
  }
  let hash: string;
  try {
    hash = await sendPhoneCode(created.id, phone, via);
  } catch (err) {
    await admin.from(PHONE_TABLE).update({ cancelled_at: new Date().toISOString() }).eq("id", created.id);
    throw err;
  }
  await admin.from(PHONE_TABLE).update({ code_hash: hash, sent_at: new Date().toISOString() }).eq("id", created.id);
  return json({ success: true, checkId: created.id });
}

async function phoneResend(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const row = await loadPhoneCheck(admin, caller, body.checkId);
  const closed = codeClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (row.code_verified_at) throw new ApiError("That number is already checked.", 400, "ALREADY_VERIFIED");
  if ((row.resends ?? 0) >= MAX_RESENDS) throw new ApiError("Too many new codes. Go back and start again.", 429, "RESEND_LIMIT");
  if (row.sent_at && Date.now() - new Date(row.sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before sending another code.", 429, "RESEND_TOO_SOON");
  }
  const hash = await sendPhoneCode(row.id, row.phone, channelOf(body.channel, "prove_phone"));
  await admin
    .from(PHONE_TABLE)
    .update({ code_hash: hash, sent_at: new Date().toISOString(), resends: (row.resends ?? 0) + 1, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .eq("id", row.id);
  return json({ success: true });
}

async function phoneVerify(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const row = await loadPhoneCheck(admin, caller, body.checkId);
  const closed = codeClosed(row, new Date());
  if (closed) throw new ApiError(closed, 410, "CODE_CLOSED");
  if (row.code_verified_at) return json({ success: true });
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!row.code_hash || code.length !== 6 || !sameHash(row.code_hash, await codeHash(row.id, code, "phone-check"))) {
    await admin.from(PHONE_TABLE).update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
    throw new ApiError("That code isn't right. Ask the customer to read it again.", 400, "WRONG_CODE");
  }
  await admin.from(PHONE_TABLE).update({ code_verified_at: new Date().toISOString() }).eq("id", row.id);
  return json({ success: true });
}

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();
  await requireStaffRole(admin, caller, ["agent", "admin", "super_admin"]);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  switch (body.action) {
    case "request":
      return request(admin, caller, body);
    case "resend":
      return resend(admin, caller, body);
    case "verify":
      return verify(admin, caller, body);
    case "complete":
      return complete(admin, req, caller, body);
    case "resubmit":
      return resubmit(admin, req, caller, body);
    case "phone_request":
      return phoneRequest(admin, caller, body);
    case "phone_resend":
      return phoneResend(admin, caller, body);
    case "phone_verify":
      return phoneVerify(admin, caller, body);
    default:
      throw new ApiError("Unknown action.", 400, "BAD_REQUEST");
  }
}));
