/**
 * Self sign-up (Tier 1): the rules, apart from the plumbing. Pure, with no
 * imports, so the test suite runs exactly this.
 *
 * Steps (design handoff, "Self sign-up"): phone → code → NIN + date of birth
 * → selfie (Smile ID Biometric KYC: NIN lookup, liveness, match with the NIMC
 * photo) → "Is this you?" → address → password / PIN / fingerprint.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_RESENDS = 3;
export const RESEND_GAP_MS = 30 * 1000;
/** Failed selfies before the sign-up goes to a person (design: "2 tries left"). */
export const MAX_SELFIE_ATTEMPTS = 3;
export const MIN_AGE = 18;

export type SignupStep = "phone" | "nin" | "selfie" | "confirm" | "addr" | "done" | "review" | "abandoned";

/** "Step N of 5" for each step. */
export function stepNumber(step: SignupStep): number {
  switch (step) {
    case "phone":
      return 1;
    case "nin":
      return 2;
    case "selfie":
    case "confirm":
      return 3;
    case "addr":
      return 4;
    default:
      return 5;
  }
}

export function validNin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{11}$/.test(digits) ? digits : null;
}

/** "YYYY-MM-DD" for a real date at least MIN_AGE years before `now`, or an error. */
export function validDob(value: unknown, now: Date): { ok: true; dob: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "Choose your date of birth." };
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: "Choose your date of birth." };
  }
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d)) age--;
  if (age < MIN_AGE) return { ok: false, error: "You need to be 18 or older to open a MiliPay account." };
  if (age > 120) return { ok: false, error: "Choose your date of birth." };
  return { ok: true, dob: value };
}

export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

export interface AddressInput {
  state: string;
  lga: string;
  street: string;
  landmark: string | null;
}

export function validAddress(body: Record<string, unknown>): { ok: true; address: AddressInput } | { ok: false; error: string } {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const state = text(body.state, 40);
  const lga = text(body.lga, 60);
  const street = text(body.street, 160);
  const landmark = text(body.landmark, 80);
  if (!(NG_STATES as readonly string[]).includes(state)) return { ok: false, error: "Choose your state." };
  if (lga.length < 2) return { ok: false, error: "Choose your LGA." };
  if (street.length < 5) return { ok: false, error: "Enter your house number and street." };
  return { ok: true, address: { state, lga, street, landmark: landmark || null } };
}

/** How the address is kept on the customer row (customers.address). */
export function addressLine(a: AddressInput): string {
  return `${a.street}, ${a.lga}, ${a.state}`;
}

// ─── Smile ID ───────────────────────────────────────────────────────────────

export type FailKind = "nin-mismatch" | "face-unclear";

export const FAIL_REASONS: Record<FailKind, string> = {
  "nin-mismatch": "Your NIN details didn't match.",
  "face-unclear": "Your face wasn't clear enough.",
};

export interface IdFields {
  firstName: string;
  lastName: string;
  otherNames: string | null;
  fullName: string;
  gender: string | null;
  dob: string | null;
  photoUrl: string | null;
}

export type SelfieOutcome =
  | { kind: "match"; fields: IdFields }
  | { kind: "fail"; failKind: FailKind; counts: boolean }
  | { kind: "review"; reason: string };

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * What one Smile ID Biometric KYC result means for this sign-up.
 *
 *   clear      the NIN on the result must be the one typed, and its date of
 *              birth the one chosen — otherwise someone else's clear result
 *              (or a different NIN) is being passed off as this one
 *   attention  a person looks at it (design: "We're checking your details")
 *   block      fraud signals go to a person; everything else is a failed try
 *   error      Smile ID couldn't run it: a try that doesn't count
 */
export function evaluateSmile(
  payload: Record<string, any>,
  expected: { nin: string; dob: string },
): SelfieOutcome {
  const status = String(payload?.status ?? "").toLowerCase();
  const reason = String(payload?.reason ?? "").toLowerCase();

  if (status === "attention") return { kind: "review", reason: "flagged" };
  if (status === "error") return { kind: "fail", failKind: "face-unclear", counts: false };
  if (status === "block") {
    if (/fraud|spoof|high_risk|duplicate|suspect/.test(reason)) return { kind: "review", reason: reason || "flagged" };
    if (/identifier|not_found|id_|mismatch|age_requirement/.test(reason) && !/face|selfie|liveness/.test(reason)) {
      return { kind: "fail", failKind: "nin-mismatch", counts: true };
    }
    return { kind: "fail", failKind: "face-unclear", counts: true };
  }
  if (status !== "clear") return { kind: "fail", failKind: "face-unclear", counts: false };

  const f = payload?.id_fields ?? {};
  const idNumber = String(f.id_number ?? "").replace(/\D/g, "");
  const dob = typeof f.date_of_birth === "string" ? f.date_of_birth.slice(0, 10) : null;
  // A clear result for another NIN, or for this NIN with another birthday,
  // is not a match for this person.
  if ((idNumber && idNumber !== expected.nin) || (dob && dob !== expected.dob)) {
    return { kind: "fail", failKind: "nin-mismatch", counts: true };
  }
  const firstName = cleanName(f.first_name);
  const lastName = cleanName(f.last_name);
  if (!firstName || !lastName) return { kind: "review", reason: "no_name_on_record" };
  const otherNames = cleanName(f.other_names) || null;
  return {
    kind: "match",
    fields: {
      firstName,
      lastName,
      otherNames,
      fullName: cleanName(f.full_name) || [firstName, otherNames, lastName].filter(Boolean).join(" "),
      // customers.gender accepts only "male" / "female".
      gender: /^(male|female)$/i.test(cleanName(f.gender)) ? cleanName(f.gender).toLowerCase() : null,
      dob,
      photoUrl: typeof f.photo_url === "string" ? f.photo_url : null,
    },
  };
}

/** "•••• ••• 4567" on "Is this you?". */
export function maskNin(nin: string): string {
  return "•••• ••• " + nin.slice(-4);
}

/**
 * Smile ID's webhook signature: base64 HMAC-SHA256 of
 * timestamp + partner id + "sid_request", keyed with the API key.
 * The message, not the key or the comparison, is what lives here.
 */
export function smileSignatureMessage(timestamp: string, partnerId: string): string {
  return `${timestamp}${partnerId}sid_request`;
}

// ─── Bank name match ────────────────────────────────────────────────────────

const nameTokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2);

/**
 * Is this bank account in the customer's own name? Banks write names in any
 * order ("OKAFOR ADAEZE C."), so: the surname must be there, and so must the
 * first name or one of the other names.
 */
export function namesMatch(
  person: { firstName: string; lastName: string; otherNames?: string | null },
  accountName: string,
): boolean {
  const account = new Set(nameTokens(accountName));
  const last = nameTokens(person.lastName);
  const given = [...nameTokens(person.firstName), ...nameTokens(person.otherNames ?? "")];
  if (last.length === 0 || given.length === 0) return false;
  return last.every((t) => account.has(t)) && given.some((t) => account.has(t));
}

// ─── Review (admin portal) ──────────────────────────────────────────────────

/** What a reviewer sees of one Smile ID result. */
export interface ReviewSummary {
  status: string | null;
  reason: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  /** The NIMC record is for the NIN the customer typed. */
  ninMatches: boolean;
  /** …and its date of birth is the one they chose. */
  dobMatches: boolean;
  photoUrl: string | null;
  selfieUrl: string | null;
  riskLevel: string | null;
}

export function reviewSummary(payload: Record<string, any> | null, expected: { nin: string | null; dob: string | null }): ReviewSummary {
  const f = payload?.id_fields ?? {};
  const idNumber = String(f.id_number ?? "").replace(/\D/g, "");
  const dob = typeof f.date_of_birth === "string" ? f.date_of_birth.slice(0, 10) : null;
  return {
    status: typeof payload?.status === "string" ? payload.status : null,
    reason: typeof payload?.reason === "string" ? payload.reason : null,
    fullName: cleanName(f.full_name) || [cleanName(f.first_name), cleanName(f.other_names), cleanName(f.last_name)].filter(Boolean).join(" ") || null,
    dateOfBirth: dob,
    ninMatches: !!idNumber && idNumber === expected.nin,
    dobMatches: !!dob && dob === expected.dob,
    photoUrl: typeof f.photo_url === "string" ? f.photo_url : null,
    selfieUrl: typeof payload?.image_links?.selfie_image === "string" ? payload.image_links.selfie_image : null,
    riskLevel: typeof payload?.antifraud?.fraud_risk?.risk_level === "string" ? payload.antifraud.fraud_risk.risk_level : null,
  };
}

export type ReviewDecision = "approve" | "retry" | "reject" | "agent";

/** The text the customer gets after a decision. Nothing secret in it. */
export function reviewSms(decision: ReviewDecision, reason?: string): string {
  if (decision === "approve") {
    return "Your MiliPay sign-up has been checked and approved. Open the MiliPay app and tap Continue signing up to finish.";
  }
  if (decision === "retry") {
    return "Your MiliPay sign-up needs a clearer selfie. Open the MiliPay app, tap Continue signing up and take it again in good light.";
  }
  if (decision === "agent") {
    return "We couldn't finish checking your identity in the app. Visit any MiliPay agent with your NIN and they'll open your account in a few minutes.";
  }
  const why = reason?.trim() ? ` Reason: ${reason.trim()}.` : "";
  return `We couldn't verify your identity for a MiliPay account.${why} If you think this is a mistake, contact support@milipay.ng.`;
}

/** The nudge for a sign-up left half-way. */
export function reminderSms(): string {
  return "You started opening a MiliPay account. Open the MiliPay app and tap Continue signing up to finish; it takes about two minutes.";
}
