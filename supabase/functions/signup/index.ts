import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json } from "../_shared/auth.ts";
import { dispatchSms } from "../_shared/notify.ts";
import { codeFrom } from "../_shared/contact-change.ts";
import { loginPhone, sentTo } from "../_shared/login-code.ts";
import {
  CODE_TTL_MS,
  FAIL_REASONS,
  MAX_CODE_ATTEMPTS,
  MAX_RESENDS,
  MAX_SELFIE_ATTEMPTS,
  RESEND_GAP_MS,
  addressLine,
  evaluateSmile,
  maskNin,
  stepNumber,
  validAddress,
  validDob,
  validNin,
  type SignupStep,
} from "../_shared/signup.ts";

/**
 * Self sign-up (Tier 1). Callers are not signed in, so this runs without a
 * JWT; every step after the phone code needs the session's resume token.
 *
 *   start          phone → a 6-digit code by SMS (refused if the number is taken)
 *   resend         a fresh code (3 at most, 30 s apart)
 *   verify_phone   the code → a resume token (kept by the app for "Save & exit")
 *   status         where this sign-up stands (resume, "Is this you?" details)
 *   nin            NIN + date of birth + consent; refused if the NIN is taken
 *   smile_token    a short-lived Smile ID token for the selfie (never the API key)
 *   selfie         the Smile ID job id the app just submitted
 *   selfie_status  the verdict, once Smile ID's webhook has delivered it
 *   confirm        "Yes, that's me"
 *   address        state, LGA, street, landmark → the Tier 1 account is created
 *                  and a one-time sign-in token handed back, so the customer
 *                  goes on to create their password, PIN and fingerprint
 *   abandon        "Start again"
 *
 * Nothing about the person is trusted from the app: their name and date of
 * birth come from NIMC through Smile ID's server-to-server webhook.
 */

const TABLE = "signup_sessions";
const encoder = new TextEncoder();

interface Session {
  id: string;
  phone: string;
  step: SignupStep;
  code_hash: string | null;
  code_sent_at: string | null;
  code_expires_at: string | null;
  code_attempts: number;
  code_resends: number;
  phone_verified_at: string | null;
  token_hash: string | null;
  nin: string | null;
  date_of_birth: string | null;
  consent_at: string | null;
  smile_job_id: string | null;
  evaluated_job_id: string | null;
  selfie_attempts: number;
  selfie_failure: string | null;
  id_first_name: string | null;
  id_last_name: string | null;
  id_other_names: string | null;
  id_full_name: string | null;
  id_gender: string | null;
  id_dob: string | null;
  id_photo_url: string | null;
  confirmed_at: string | null;
  customer_id: string | null;
  expires_at: string;
}

function secret(): string {
  const s = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!s) throw new ApiError("Sign-up is unavailable right now. Please try again later.", 503, "UNAVAILABLE");
  return s;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function callerAddress(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    // Failing closed: every step here costs an SMS or a paid identity check.
    console.error("[signup] rate limit check failed", error);
    throw new ApiError("Sign-up is unavailable right now. Please try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
}

const PHONE_TAKEN = "This number already has a MiliPay account.";
const NIN_TAKEN = "This NIN already has a MiliPay account.";
const START_AGAIN = "This sign-up has expired. Start again.";

async function phoneTaken(admin: SupabaseClient, phone: string): Promise<boolean> {
  const { data } = await admin.from("customers").select("id").eq("phone", phone).limit(1).maybeSingle();
  return Boolean(data);
}

async function ninTaken(admin: SupabaseClient, nin: string): Promise<boolean> {
  const { data } = await admin.from("customers").select("id").eq("nin", nin).limit(1).maybeSingle();
  return Boolean(data);
}

async function sendCode(phone: string, code: string): Promise<boolean> {
  const message = `Your MiliPay sign-up code is ${code}. It expires in 10 minutes. MiliPay will never call or text to ask for it.`;
  const result = await dispatchSms(phone, message);
  if (!result.delivered) console.error("[signup] SMS not sent", result.attempts);
  return result.delivered;
}

const NOT_SENT = "We couldn't send a code to that number right now. Please try again shortly.";

async function loadSession(admin: SupabaseClient, id: unknown): Promise<Session> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) throw new ApiError(START_AGAIN, 400, "BAD_REQUEST");
  const { data } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!data) throw new ApiError(START_AGAIN, 404, "NOT_FOUND");
  return data as Session;
}

/** A session past the phone step: its resume token must match, and it must still be open. */
async function authed(admin: SupabaseClient, body: Record<string, unknown>): Promise<Session> {
  const s = await loadSession(admin, body.sessionId);
  const token = typeof body.token === "string" ? body.token : "";
  if (!s.token_hash || !token || !sameHash(s.token_hash, await hmac(`signup-token:${s.id}:${token}`))) {
    throw new ApiError(START_AGAIN, 401, "BAD_TOKEN");
  }
  if (new Date(s.expires_at).getTime() <= Date.now()) throw new ApiError(START_AGAIN, 410, "EXPIRED");
  return s;
}

function requireStep(s: Session, ...steps: SignupStep[]) {
  if (s.step === "review") throw new ApiError("We're checking your details. We'll text you within 24 hours.", 409, "IN_REVIEW");
  if (s.step === "done") throw new ApiError("Your account is ready. Log in with your phone number.", 409, "DONE");
  if (s.step === "abandoned") throw new ApiError(START_AGAIN, 410, "ABANDONED");
  if (!steps.includes(s.step)) throw new ApiError("Something went out of order. Go back and try again.", 409, "WRONG_STEP");
}

async function update(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[signup] session not saved", error);
    throw new ApiError("Could not save your progress. Please try again.", 503, "UNAVAILABLE");
  }
}

/** What the app shows for a session (resume card, "Is this you?"). */
function view(s: Session) {
  return {
    success: true,
    step: s.step,
    stepNumber: stepNumber(s.step),
    sentTo: sentTo(s.phone),
    phone: s.phone,
    nin: s.nin ? { masked: maskNin(s.nin) } : null,
    dateOfBirth: s.date_of_birth,
    selfie: {
      attemptsLeft: Math.max(0, MAX_SELFIE_ATTEMPTS - (Number(s.selfie_attempts) || 0)),
      failure: s.selfie_failure,
      failureText: s.selfie_failure ? FAIL_REASONS[s.selfie_failure as keyof typeof FAIL_REASONS] ?? null : null,
    },
    // Only once the selfie matched: a name is never shown for a NIN alone.
    person: s.id_full_name
      ? {
          fullName: s.id_full_name,
          firstName: s.id_first_name,
          lastName: s.id_last_name,
          dateOfBirth: s.id_dob ?? s.date_of_birth,
          photoUrl: s.id_photo_url,
          ninMasked: s.nin ? maskNin(s.nin) : null,
        }
      : null,
  };
}

// ─── Phone ──────────────────────────────────────────────────────────────────

async function start(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  const phone = loginPhone(body.phone);
  if (!phone) throw new ApiError("Enter the 11-digit number you want to use.", 400, "BAD_PHONE");
  await rateLimit(admin, `signup:address:${address}`, 20, 60 * 60);
  await rateLimit(admin, `signup:phone:${phone}`, 5, 60 * 60);
  if (await phoneTaken(admin, phone)) throw new ApiError(PHONE_TAKEN, 409, "PHONE_TAKEN");

  // One sign-up per number at a time: starting again replaces the last.
  await admin
    .from(TABLE)
    .update({ step: "abandoned", updated_at: new Date().toISOString() })
    .eq("phone", phone)
    .in("step", ["phone", "nin", "selfie", "confirm", "addr"]);

  const { data: created, error } = await admin.from(TABLE).insert({ phone, step: "phone", expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() }).select("id").single();
  if (error || !created) {
    console.error("[signup] session not created", error);
    throw new ApiError("Could not start sign-up. Please try again.", 503, "UNAVAILABLE");
  }
  const code = codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!(await sendCode(phone, code))) {
    await update(admin, created.id, { step: "abandoned" });
    throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  }
  await update(admin, created.id, {
    code_hash: await hmac(`signup-code:${created.id}:${code}`),
    code_sent_at: new Date().toISOString(),
    code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return json({ success: true, sessionId: created.id, sentTo: sentTo(phone) });
}

async function resend(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  await rateLimit(admin, `signup:address:${address}`, 20, 60 * 60);
  const s = await loadSession(admin, body.sessionId);
  if (s.step !== "phone" || s.phone_verified_at) throw new ApiError(START_AGAIN, 409, "WRONG_STEP");
  const resends = Number(s.code_resends) || 0;
  if (resends >= MAX_RESENDS) throw new ApiError("You've asked for a new code too many times. Start again.", 429, "RESEND_LIMIT");
  if (s.code_sent_at && Date.now() - new Date(s.code_sent_at).getTime() < RESEND_GAP_MS) {
    throw new ApiError("Wait a few seconds before asking for another code.", 429, "RESEND_TOO_SOON");
  }
  const code = codeFrom(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!(await sendCode(s.phone, code))) throw new ApiError(NOT_SENT, 503, "CODE_NOT_SENT");
  await update(admin, s.id, {
    code_hash: await hmac(`signup-code:${s.id}:${code}`),
    code_sent_at: new Date().toISOString(),
    code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    code_resends: resends + 1,
  });
  return json({ success: true });
}

async function verifyPhone(admin: SupabaseClient, address: string, body: Record<string, unknown>) {
  await rateLimit(admin, `signup:verify:${address}`, 30, 60 * 60);
  const s = await loadSession(admin, body.sessionId);
  if (s.step !== "phone" || s.phone_verified_at) throw new ApiError(START_AGAIN, 409, "WRONG_STEP");
  if (!s.code_expires_at || new Date(s.code_expires_at).getTime() <= Date.now()) {
    throw new ApiError("That code has expired. Ask for a new one.", 410, "CODE_EXPIRED");
  }
  const attempts = Number(s.code_attempts) || 0;
  if (attempts >= MAX_CODE_ATTEMPTS) throw new ApiError("Too many wrong codes. Start again.", 410, "CODE_CLOSED");
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter all 6 digits of the code.", 400, "BAD_CODE");

  if (!s.code_hash || !sameHash(s.code_hash, await hmac(`signup-code:${s.id}:${code}`))) {
    await update(admin, s.id, { code_attempts: attempts + 1 });
    if (attempts + 1 >= MAX_CODE_ATTEMPTS) throw new ApiError("Too many wrong codes. Start again.", 410, "CODE_CLOSED");
    throw new ApiError("That code isn't right. Check the SMS and try again.", 400, "CODE_INCORRECT", {
      attemptsLeft: MAX_CODE_ATTEMPTS - attempts - 1,
    });
  }
  // The number may have been registered since the code was sent.
  if (await phoneTaken(admin, s.phone)) {
    await update(admin, s.id, { step: "abandoned" });
    throw new ApiError(PHONE_TAKEN, 409, "PHONE_TAKEN");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await update(admin, s.id, {
    phone_verified_at: new Date().toISOString(),
    step: "nin",
    code_hash: null,
    token_hash: await hmac(`signup-token:${s.id}:${token}`),
  });
  return json({ success: true, sessionId: s.id, token, step: "nin" });
}

// ─── Identity ───────────────────────────────────────────────────────────────

async function nin(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await authed(admin, body);
  requireStep(s, "nin", "selfie");
  const number = validNin(body.nin);
  if (!number) throw new ApiError("Enter all 11 digits of your NIN.", 400, "BAD_NIN");
  const dob = validDob(body.dateOfBirth, new Date());
  if (!dob.ok) throw new ApiError(dob.error, 400, "BAD_DOB");
  if (body.consent !== true) throw new ApiError("Tick the box to agree to the identity check.", 400, "NO_CONSENT");
  await rateLimit(admin, `signup:nin:${s.id}`, 10, 60 * 60);
  if (await ninTaken(admin, number)) throw new ApiError(NIN_TAKEN, 409, "NIN_TAKEN");

  // A changed NIN or birthday starts the selfie over: an earlier match was
  // for the old details.
  const changed = number !== s.nin || dob.dob !== s.date_of_birth;
  await update(admin, s.id, {
    nin: number,
    date_of_birth: dob.dob,
    consent_at: new Date().toISOString(),
    step: "selfie",
    ...(changed ? { smile_job_id: null, evaluated_job_id: null, selfie_failure: null } : {}),
  });
  return json({ ...view({ ...s, nin: number, date_of_birth: dob.dob, step: "selfie" }) });
}

function smileConfig() {
  const partnerId = Deno.env.get("SMILE_PARTNER_ID") ?? "";
  const apiKey = Deno.env.get("SMILE_API_KEY") ?? "";
  const sandbox = (Deno.env.get("SMILE_ENVIRONMENT") ?? "sandbox") !== "production";
  return {
    partnerId,
    apiKey,
    sandbox,
    base: sandbox ? "https://testapi.smileidentity.com" : "https://api.smileidentity.com",
    ready: Boolean(partnerId && apiKey),
  };
}

async function smileToken(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await authed(admin, body);
  requireStep(s, "selfie");
  const cfg = smileConfig();
  if (!cfg.ready) {
    throw new ApiError("Selfie checks aren't switched on yet. Please try again later.", 503, "SMILE_NOT_CONFIGURED");
  }
  await rateLimit(admin, `signup:smile:${s.id}`, 10, 60 * 60);
  const form = new FormData();
  form.append("partner_id", cfg.partnerId);
  const response = await fetch(`${cfg.base}/v3/token`, {
    method: "POST",
    headers: { "smileid-partner-id": cfg.partnerId, "smileid-api-key": cfg.apiKey },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.token !== "string") {
    console.error(`[signup] Smile ID token refused: HTTP ${response.status}`);
    throw new ApiError("Selfie checks are unavailable right now. Please try again shortly.", 503, "SMILE_UNAVAILABLE");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return json({
    success: true,
    token: data.token,
    partnerId: cfg.partnerId,
    sandbox: cfg.sandbox,
    callbackUrl: `${supabaseUrl}/functions/v1/smile-webhook`,
    idInfo: { country: "NG", idType: "NIN_V2", idNumber: s.nin },
  });
}

async function selfie(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await authed(admin, body);
  requireStep(s, "selfie");
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId || jobId.length > 128) throw new ApiError("The selfie didn't go through. Try again.", 400, "BAD_JOB");
  await update(admin, s.id, { smile_job_id: jobId, selfie_failure: null });
  return selfieStatus(admin, { ...body }, { ...s, smile_job_id: jobId, selfie_failure: null });
}

/** Apply Smile ID's verdict for the session's current job, once. */
async function selfieStatus(admin: SupabaseClient, body: Record<string, unknown>, known?: Session) {
  const s = known ?? (await authed(admin, body));
  if (s.step !== "selfie") return json({ ...view(s) });
  if (!s.smile_job_id) return json({ ...view(s), pending: false });
  if (s.evaluated_job_id === s.smile_job_id) return json({ ...view(s) });

  const { data: result } = await admin.from("smile_results").select("*").eq("job_id", s.smile_job_id).maybeSingle();
  if (!result) return json({ ...view(s), pending: true });

  const outcome = evaluateSmile(result.payload ?? {}, { nin: s.nin ?? "", dob: s.date_of_birth ?? "" });
  if (outcome.kind === "match") {
    const f = outcome.fields;
    const patch = {
      evaluated_job_id: s.smile_job_id,
      step: "confirm" as const,
      selfie_failure: null,
      id_first_name: f.firstName,
      id_last_name: f.lastName,
      id_other_names: f.otherNames,
      id_full_name: f.fullName,
      id_gender: f.gender,
      id_dob: f.dob ?? s.date_of_birth,
      id_photo_url: f.photoUrl,
    };
    await update(admin, s.id, patch);
    return json({ ...view({ ...s, ...patch }) });
  }
  if (outcome.kind === "review") {
    await update(admin, s.id, { evaluated_job_id: s.smile_job_id, step: "review", review_reason: outcome.reason });
    return json({ ...view({ ...s, step: "review" }) });
  }
  const attempts = (Number(s.selfie_attempts) || 0) + (outcome.counts ? 1 : 0);
  if (attempts >= MAX_SELFIE_ATTEMPTS) {
    await update(admin, s.id, { evaluated_job_id: s.smile_job_id, selfie_attempts: attempts, step: "review", review_reason: "three_failed_selfies" });
    return json({ ...view({ ...s, step: "review", selfie_attempts: attempts }) });
  }
  await update(admin, s.id, { evaluated_job_id: s.smile_job_id, selfie_attempts: attempts, selfie_failure: outcome.failKind });
  return json({ ...view({ ...s, selfie_attempts: attempts, selfie_failure: outcome.failKind }) });
}

async function confirm(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await authed(admin, body);
  requireStep(s, "confirm", "addr");
  if (!s.id_full_name) throw new ApiError("Take your selfie first.", 409, "WRONG_STEP");
  await update(admin, s.id, { step: "addr", confirmed_at: s.confirmed_at ?? new Date().toISOString() });
  return json({ ...view({ ...s, step: "addr" }) });
}

// ─── Account ────────────────────────────────────────────────────────────────

async function address(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await authed(admin, body);
  requireStep(s, "addr");
  if (!s.id_full_name || !s.id_first_name || !s.id_last_name || !s.nin) throw new ApiError("Take your selfie first.", 409, "WRONG_STEP");
  const checked = validAddress(body);
  if (!checked.ok) throw new ApiError(checked.error, 400, "BAD_ADDRESS");
  const a = checked.address;

  // Checked again here: either could have been registered since.
  if (await phoneTaken(admin, s.phone)) throw new ApiError(PHONE_TAKEN, 409, "PHONE_TAKEN");
  if (await ninTaken(admin, s.nin)) throw new ApiError(NIN_TAKEN, 409, "NIN_TAKEN");

  // The sign-in identity has no password: the customer creates one next.
  // Supabase wants an email; this internal one is never written to.
  const digits = s.phone.replace(/\D/g, "");
  const authEmail = `${digits}@customer.milipay.ng`;
  const authPhone = `+234${s.phone.slice(1)}`;
  const fullName = s.id_full_name;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    phone: authPhone,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: "customer" },
  });
  if (createError || !created?.user) {
    console.error("[signup] sign-in identity not created", createError?.message);
    const taken = /already|exists|registered/i.test(createError?.message ?? "");
    throw taken
      ? new ApiError(PHONE_TAKEN, 409, "PHONE_TAKEN")
      : new ApiError("Could not create your account. Please try again.", 503, "UNAVAILABLE");
  }
  const authUserId = created.user.id;
  const now = new Date().toISOString();

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .insert({
      auth_user_id: authUserId,
      first_name: s.id_first_name,
      last_name: s.id_last_name,
      phone: s.phone,
      email: null,
      nin: s.nin,
      nin_last_4: s.nin.slice(-4),
      nin_verified: true,
      nin_verified_at: now,
      date_of_birth: s.id_dob ?? s.date_of_birth,
      gender: s.id_gender,
      state: a.state,
      lga: a.lga,
      address: addressLine(a),
      address_landmark: a.landmark,
      kyc_tier: 1,
      status: "active",
      signup_source: "self",
      must_change_password: true,
      selfie_verified_at: now,
      verified_at: now,
      // has_palm_template is generated from the palm template: none yet.
    })
    .select("id")
    .single();
  if (customerError || !customer) {
    console.error("[signup] customer row not created; removing the identity", customerError);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    throw new ApiError("Could not create your account. Please try again.", 503, "UNAVAILABLE");
  }

  await update(admin, s.id, { step: "done", customer_id: customer.id, state: a.state, lga: a.lga, street: a.street, landmark: a.landmark });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: authEmail });
  const tokenHash = (link as any)?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    // The account exists; they can log in with their number and a code.
    console.error("[signup] sign-in token not issued", linkError?.message);
    return json({ success: true, step: "done", tokenHash: null });
  }
  return json({ success: true, step: "done", tokenHash });
}

async function abandon(admin: SupabaseClient, body: Record<string, unknown>) {
  const s = await loadSession(admin, body.sessionId);
  const token = typeof body.token === "string" ? body.token : "";
  // Before the phone is verified there is no token; the id alone may end it.
  if (s.token_hash && !(token && sameHash(s.token_hash, await hmac(`signup-token:${s.id}:${token}`)))) {
    throw new ApiError(START_AGAIN, 401, "BAD_TOKEN");
  }
  if (["phone", "nin", "selfie", "confirm", "addr"].includes(s.step)) await update(admin, s.id, { step: "abandoned" });
  return json({ success: true });
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const admin = adminClient();
  const address_ = callerAddress(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  switch (action) {
    case "start":
      return start(admin, address_, body);
    case "resend":
      return resend(admin, address_, body);
    case "verify_phone":
      return verifyPhone(admin, address_, body);
    case "status": {
      const s = await authed(admin, body);
      return s.step === "selfie" ? selfieStatus(admin, body, s) : json(view(s));
    }
    case "nin":
      return nin(admin, body);
    case "smile_token":
      return smileToken(admin, body);
    case "selfie":
      return selfie(admin, body);
    case "selfie_status":
      return selfieStatus(admin, body);
    case "confirm":
      return confirm(admin, body);
    case "address":
      return address(admin, body);
    case "abandon":
      return abandon(admin, body);
    default:
      throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
  }
}));
