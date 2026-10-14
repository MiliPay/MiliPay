import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole, type Caller } from "../_shared/auth.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import { loginSms } from "../_shared/login-code.ts";
import { dispatchEverywhere, dispatchSms } from "../_shared/notify.ts";
import {
  APPLICANT_ACTIONS,
  CUSTOMER_ACTIONS,
  type DeskAction,
  deskLine,
  fraudCaseSms,
  nearestAgentsSms,
  noteRequired,
  resetLinkSms,
  signupCodeSms,
  signupRef,
} from "../_shared/support-desk.ts";

/**
 * Account help from the support portal (design handoff, the customer panel).
 * Support can't approve sign-ups, move money or change limits; these are the
 * things they can do for someone on the phone or in a chat:
 *
 *   For an account holder
 *     reset_link       an SMS telling them how to reset their password in the
 *                      app (they confirm it there with a code)
 *     login_code       a fresh code for a sign-in they have already started
 *     nearest_agents   the agents in their state, to add a palm (Tier 1)
 *   For someone still signing up
 *     signup_priority  asks the admins to look at their review first
 *     nin_misuse       opens a fraud report on the account that holds their NIN
 *     signup_code      a fresh code for a sign-up still at the phone step
 *     nearest_agents
 *
 * Each needs a note (except nearest_agents), goes on the audit log, and
 * writes a staff-only line and the note to the ticket it came from.
 */

const bodySchema = z.object({
  action: z.enum(["reset_link", "login_code", "nearest_agents", "signup_priority", "nin_misuse", "signup_code"]),
  ticketId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  signupId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional().default(""),
});

const SIGNUP_CODE_TTL_MS = 10 * 60 * 1000;

async function hmacHex(message: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!secret) throw new ApiError("Codes can't be sent right now. Try again later.", 503, "UNAVAILABLE");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newCode(): string {
  return codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[support-desk] rate limit check failed", error);
    throw new ApiError("This isn't available right now. Try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("That has been sent several times already. Wait a while before sending again.", 429, "RATE_LIMITED");
}

/** Up to 3 active agents in a state, for the SMS. */
async function agentsIn(admin: SupabaseClient, state: string) {
  const { data } = await admin
    .from("staff_profiles")
    .select("full_name, phone")
    .eq("role", "agent")
    .eq("status", "active")
    .ilike("state", state)
    .order("created_at", { ascending: true })
    .limit(3);
  return ((data ?? []) as { full_name: string; phone: string | null }[]).map((a) => ({ name: a.full_name, phone: a.phone }));
}

async function writeToTicket(admin: SupabaseClient, caller: Caller, ticketId: string | undefined, line: string, note: string) {
  if (!ticketId) return;
  const rows = [{ ticket_id: ticketId, sender_id: caller.id, sender_type: "event", content: line }];
  if (note) rows.push({ ticket_id: ticketId, sender_id: caller.id, sender_type: "note", content: note });
  const { error } = await admin.from("ticket_messages").insert(rows);
  if (error) console.error("[support-desk] ticket lines not written", error.message);
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  await requireStaffRole(admin, caller, ["support", "admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(parsed.error.issues[0].message, 400, "VALIDATION_FAILED");
  const { action, ticketId, customerId, signupId, note } = parsed.data;
  if (noteRequired(action) && note.length < 3) {
    throw new ApiError("Add a note: how you confirmed it is really them.", 400, "NOTE_REQUIRED");
  }
  const forCustomer = Boolean(customerId);
  if (forCustomer ? !CUSTOMER_ACTIONS.includes(action) : !signupId || !APPLICANT_ACTIONS.includes(action)) {
    throw new ApiError("That action doesn't apply to this person.", 400, "WRONG_PERSON");
  }

  const { data: me } = await admin.from("staff_profiles").select("full_name").eq("id", caller.id).maybeSingle();
  const staff = me?.full_name || "Support";

  // ── Account holders ─────────────────────────────────────────────────────
  if (customerId) {
    const { data: c } = await admin
      .from("customers")
      .select("id, first_name, last_name, phone, state, status, auth_user_id, kyc_tier")
      .eq("id", customerId)
      .maybeSingle();
    if (!c) throw new ApiError("That customer was not found.", 404, "NOT_FOUND");
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone;
    let told = false;

    if (action === "reset_link") {
      if (!c.auth_user_id || c.status !== "active") throw new ApiError("This customer has no active login to reset.", 409, "NO_LOGIN");
      await rateLimit(admin, `support:reset:${c.id}`, 3, 60 * 60);
      told = (await dispatchSms(c.phone, resetLinkSms())).delivered;
    } else if (action === "login_code") {
      // A code belongs to a sign-in the customer started in the app; this
      // replaces the one they were sent, it doesn't start a new sign-in.
      const { data: row } = await admin
        .from("login_codes")
        .select("id, phone, resends")
        .eq("customer_id", c.id)
        .is("consumed_at", null)
        .is("cancelled_at", null)
        .is("code_verified_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) {
        throw new ApiError(
          "They aren't signing in right now. Ask them to open the app and enter their number, then resend if the code doesn't arrive.",
          409,
          "NO_SIGN_IN",
        );
      }
      await rateLimit(admin, `support:login-code:${c.id}`, 3, 60 * 60);
      const code = newCode();
      // Same hash as the login-code function: HMAC of login:<row>:<code>.
      const hash = await hmacHex(`login:${row.id}:${code}`);
      const sent = await dispatchEverywhere(row.phone, loginSms(code));
      if (!sent.delivered) throw new ApiError("The code couldn't be sent. Try again shortly.", 503, "CODE_NOT_SENT");
      await admin
        .from("login_codes")
        .update({ code_hash: hash, sent_at: new Date().toISOString(), resends: (Number(row.resends) || 0) + 1 })
        .eq("id", row.id);
      told = true;
    } else {
      if (!c.state) throw new ApiError("Their state isn't on file, so there's no agent list to send.", 409, "NO_STATE");
      const agents = await agentsIn(admin, c.state);
      if (!agents.length) throw new ApiError(`There are no MiliPay agents in ${c.state} yet.`, 409, "NO_AGENTS");
      await rateLimit(admin, `support:agents:${c.id}`, 3, 60 * 60);
      told = (await dispatchSms(c.phone, nearestAgentsSms(c.state, agents))).delivered;
    }

    if (!told) throw new ApiError("The SMS couldn't be sent. Try again shortly.", 503, "NOT_SENT");
    await recordAudit(admin, req, caller, {
      category: "Support",
      action: { reset_link: "sent a password reset to", login_code: "resent a login code to", nearest_agents: "sent nearest agents to" }[
        action as "reset_link" | "login_code" | "nearest_agents"
      ],
      target: name,
      targetId: c.id,
      reason: note || null,
    });
    await writeToTicket(admin, caller, ticketId, deskLine(action, { phone: c.phone, state: c.state, staff }), note);
    return json({ success: true });
  }

  // ── People still signing up ─────────────────────────────────────────────
  const { data: s } = await admin
    .from("signup_sessions")
    .select("id, phone, step, state, phone_verified_at, code_resends, id_full_name, nin_blocked_customer_id, nin_blocked_at, customer_id")
    .eq("id", signupId!)
    .maybeSingle();
  if (!s) throw new ApiError("That sign-up was not found.", 404, "NOT_FOUND");
  const ref = signupRef(s.id);
  const who = s.id_full_name || s.phone;
  let caseNumber: string | undefined;

  if (action === "signup_priority") {
    if (s.step !== "review") throw new ApiError("This sign-up isn't waiting for review.", 409, "NOT_IN_REVIEW");
    const { error } = await admin
      .from("signup_sessions")
      .update({ priority_at: new Date().toISOString(), priority_by: caller.id, priority_note: note })
      .eq("id", s.id);
    if (error) throw new ApiError("Couldn't send that to the admins. Try again.", 503, "UNAVAILABLE");
  } else if (action === "nin_misuse") {
    if (!s.nin_blocked_at) throw new ApiError("This sign-up wasn't stopped for a NIN that's already registered.", 409, "NOT_BLOCKED");
    const { data: open } = await admin
      .from("fraud_reports")
      .select("case_number")
      .eq("signup_session_id", s.id)
      .eq("status", "open")
      .maybeSingle();
    if (open) throw new ApiError(`A fraud case is already open: ${open.case_number}.`, 409, "ALREADY_REPORTED");
    const { data: report, error } = await admin
      .from("fraud_reports")
      .insert({ signup_session_id: s.id, customer_id: s.nin_blocked_customer_id, ticket_id: ticketId ?? null, note, reported_by: caller.id })
      .select("case_number")
      .single();
    if (error || !report) throw new ApiError("Couldn't open the fraud case. Try again.", 503, "UNAVAILABLE");
    caseNumber = report.case_number;
    const sms = await dispatchSms(s.phone, fraudCaseSms(report.case_number));
    if (!sms.delivered) console.error("[support-desk] applicant not told about the fraud case", sms.attempts);
  } else if (action === "signup_code") {
    if (s.step !== "phone" || s.phone_verified_at) {
      throw new ApiError("Their phone is already verified, so they don't need a code.", 409, "PHONE_VERIFIED");
    }
    await rateLimit(admin, `support:signup-code:${s.id}`, 3, 60 * 60);
    const code = newCode();
    if (!(await dispatchSms(s.phone, signupCodeSms(code))).delivered) {
      throw new ApiError("The code couldn't be sent. Try again shortly.", 503, "CODE_NOT_SENT");
    }
    // Same hash as the signup function: HMAC of signup-code:<session>:<code>.
    await admin
      .from("signup_sessions")
      .update({
        code_hash: await hmacHex(`signup-code:${s.id}:${code}`),
        code_sent_at: new Date().toISOString(),
        code_expires_at: new Date(Date.now() + SIGNUP_CODE_TTL_MS).toISOString(),
        code_resends: (Number(s.code_resends) || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id);
  } else {
    if (!s.state) throw new ApiError("They haven't said which state they're in yet, so there's no agent list to send.", 409, "NO_STATE");
    const agents = await agentsIn(admin, s.state);
    if (!agents.length) throw new ApiError(`There are no MiliPay agents in ${s.state} yet.`, 409, "NO_AGENTS");
    await rateLimit(admin, `support:agents:${s.id}`, 3, 60 * 60);
    if (!(await dispatchSms(s.phone, nearestAgentsSms(s.state, agents))).delivered) {
      throw new ApiError("The SMS couldn't be sent. Try again shortly.", 503, "NOT_SENT");
    }
  }

  const audited: Record<string, string> = {
    signup_priority: "asked admins to prioritise sign-up",
    nin_misuse: "reported possible NIN misuse for sign-up",
    signup_code: "resent the sign-up code for",
    nearest_agents: "sent nearest agents to",
  };
  await recordAudit(admin, req, caller, {
    category: "Sign-ups",
    action: audited[action],
    target: `${ref} · ${who}`,
    targetId: s.id,
    reason: note || null,
    after: caseNumber ? { fraudCase: caseNumber } : null,
  });
  await writeToTicket(admin, caller, ticketId, deskLine(action as DeskAction, { phone: s.phone, state: s.state, staff, signup: ref, caseNumber }), note);
  return json({ success: true, caseNumber: caseNumber ?? null });
}));
