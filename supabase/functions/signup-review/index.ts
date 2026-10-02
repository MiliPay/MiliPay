import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole, type Caller } from "../_shared/auth.ts";
import { recordAudit } from "../_shared/audit.ts";
import { dispatchSms } from "../_shared/notify.ts";
import { evaluateSmile, reminderSms, reviewSms, reviewSummary, type ReviewDecision } from "../_shared/signup.ts";

/**
 * Self sign-ups waiting for a person (admin portal › Customers › Sign-up
 * reviews). A sign-up lands here when Smile ID flags it, or after three
 * failed selfies. Administrators only, like approving an agent enrolment.
 *
 *   list     the sign-ups in review, newest first, with what Smile ID said
 *   decide   approve  — only against a NIMC record for the NIN they typed:
 *                       the customer goes on to "Is this you?" and finishes
 *            retry    — another three selfie attempts
 *            reject   — the sign-up ends; the reason is sent to them
 *
 * The customer is told by SMS either way. Their app keeps the sign-up, so
 * "Continue signing up" on Welcome picks it up after an approval or retry.
 */

const TABLE = "signup_sessions";
const WEEK_MS = 7 * 24 * 3600 * 1000;

async function smileResult(admin: SupabaseClient, jobId: string | null) {
  if (!jobId) return null;
  const { data } = await admin.from("smile_results").select("payload").eq("job_id", jobId).maybeSingle();
  return (data?.payload ?? null) as Record<string, any> | null;
}

async function list(admin: SupabaseClient) {
  const { data, error } = await admin
    .from(TABLE)
    .select("id, phone, nin, date_of_birth, review_reason, selfie_attempts, smile_job_id, created_at, updated_at")
    .eq("step", "review")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[signup-review] list failed", error);
    throw new ApiError("Could not load sign-up reviews.", 503, "UNAVAILABLE");
  }
  const items = [];
  for (const s of data ?? []) {
    const payload = await smileResult(admin, s.smile_job_id);
    items.push({
      id: s.id,
      phone: s.phone,
      ninLast4: s.nin ? String(s.nin).slice(-4) : null,
      dateOfBirth: s.date_of_birth,
      reason: s.review_reason,
      selfieAttempts: Number(s.selfie_attempts) || 0,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      smile: payload ? reviewSummary(payload, { nin: s.nin, dob: s.date_of_birth }) : null,
    });
  }
  return json({ success: true, items });
}

async function decide(admin: SupabaseClient, req: Request, caller: Caller, body: Record<string, unknown>) {
  const staffId = caller.id;
  const decision = body.decision as ReviewDecision;
  if (!["approve", "retry", "reject", "agent"].includes(decision)) {
    throw new ApiError("Choose approve, retry, reject or send to an agent.", 400, "BAD_DECISION");
  }
  const id = typeof body.sessionId === "string" ? body.sessionId : "";
  // reason: what the customer is told (rejections). note: what the reviewer
  // checked or why — required to approve, kept on the audit log.
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (decision === "reject" && reason.length < 3) throw new ApiError("Give the customer a reason.", 400, "NO_REASON");
  if (decision === "approve" && note.length < 3) throw new ApiError("Say what you checked before approving.", 400, "NO_NOTE");

  const { data: s } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!s) throw new ApiError("That sign-up was not found.", 404, "NOT_FOUND");
  if (s.step !== "review") throw new ApiError("That sign-up has already been dealt with.", 409, "NOT_IN_REVIEW");

  const now = new Date().toISOString();
  const reviewed = { reviewed_at: now, reviewed_by: staffId, updated_at: now };
  let patch: Record<string, unknown>;

  if (decision === "approve") {
    // Only against NIMC's own record for the NIN and birthday typed: a
    // reviewer can overrule a flag, never invent an identity.
    const payload = await smileResult(admin, s.smile_job_id);
    const asClear = payload ? evaluateSmile({ ...payload, status: "clear" }, { nin: s.nin ?? "", dob: s.date_of_birth ?? "" }) : null;
    if (!asClear || asClear.kind !== "match") {
      throw new ApiError(
        "There is no NIMC record matching this NIN and date of birth to approve. Give them another try instead.",
        409,
        "NOTHING_TO_APPROVE",
      );
    }
    const f = asClear.fields;
    patch = {
      ...reviewed,
      step: "confirm",
      selfie_failure: null,
      evaluated_job_id: s.smile_job_id,
      id_first_name: f.firstName,
      id_last_name: f.lastName,
      id_other_names: f.otherNames,
      id_full_name: f.fullName,
      id_gender: f.gender,
      id_dob: f.dob ?? s.date_of_birth,
      id_photo_url: f.photoUrl,
      expires_at: new Date(Date.now() + WEEK_MS).toISOString(),
      decision: "approved",
    };
  } else if (decision === "retry") {
    patch = {
      ...reviewed,
      step: "selfie",
      selfie_attempts: 0,
      selfie_failure: null,
      smile_job_id: null,
      evaluated_job_id: null,
      expires_at: new Date(Date.now() + WEEK_MS).toISOString(),
      decision: "retry",
    };
  } else if (decision === "agent") {
    patch = { ...reviewed, step: "abandoned", decision: "agent" };
  } else {
    patch = { ...reviewed, step: "abandoned", review_reason: `rejected: ${reason}`, decision: "rejected" };
  }

  // Only if it is still in review: two reviewers can't both decide.
  const { data: updated, error } = await admin.from(TABLE).update(patch).eq("id", s.id).eq("step", "review").select("id").maybeSingle();
  if (error) {
    console.error("[signup-review] decision not saved", error);
    throw new ApiError("Could not save the decision. Please try again.", 503, "UNAVAILABLE");
  }
  if (!updated) throw new ApiError("That sign-up has already been dealt with.", 409, "NOT_IN_REVIEW");

  await recordAudit(admin, req, caller, {
    category: "Sign-ups",
    action: {
      approve: "approved sign-up",
      retry: "gave another selfie try to",
      reject: "rejected sign-up",
      agent: "sent sign-up to an agent",
    }[decision],
    target: (patch.id_full_name as string | undefined) || s.id_full_name || s.phone,
    targetId: s.id,
    reason: [reason, note].filter(Boolean).join(" — ") || null,
    before: { step: "review", reason: s.review_reason },
    after: { step: patch.step },
  });

  const sms = await dispatchSms(s.phone, reviewSms(decision, reason));
  if (!sms.delivered) console.error("[signup-review] customer not told", sms.attempts);
  return json({ success: true, decision, customerTold: sms.delivered });
}

/** A text to finish signing up, for one left half-way. At most once a day. */
async function remind(admin: SupabaseClient, req: Request, caller: Caller, body: Record<string, unknown>) {
  const id = typeof body.sessionId === "string" ? body.sessionId : "";
  const { data: s } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!s) throw new ApiError("That sign-up was not found.", 404, "NOT_FOUND");
  // Unfinished only. One the person ended themselves ("Start again") stays ended.
  if (!["phone", "nin", "selfie", "confirm", "addr"].includes(s.step)) {
    throw new ApiError("Only an unfinished sign-up can be reminded.", 409, "NOT_UNFINISHED");
  }
  if (s.reminded_at && Date.now() - Date.parse(s.reminded_at) < 24 * 3600 * 1000) {
    throw new ApiError("They were reminded in the last 24 hours.", 429, "REMINDED_RECENTLY");
  }
  const sms = await dispatchSms(s.phone, reminderSms());
  if (sms.delivered) {
    const now = new Date().toISOString();
    // One that ran out of time gets another week to finish.
    await admin.from(TABLE).update({ reminded_at: now, updated_at: now, expires_at: new Date(Date.now() + WEEK_MS).toISOString() }).eq("id", s.id);
  }
  await recordAudit(admin, req, caller, {
    category: "Sign-ups",
    action: "sent sign-up reminder to",
    target: s.id_full_name || s.phone,
    targetId: s.id,
    after: { delivered: sms.delivered },
  });
  return json({ success: true, customerTold: sms.delivered });
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  await requireStaffRole(admin, caller, ["admin", "super_admin"]);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "list") return list(admin);
  if (body.action === "decide") return decide(admin, req, caller, body);
  if (body.action === "remind") return remind(admin, req, caller, body);
  throw new ApiError(`Unknown action: ${String(body.action ?? "")}`, 400, "UNKNOWN_ACTION");
}));
