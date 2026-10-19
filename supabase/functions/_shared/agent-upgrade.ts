/**
 * Upgrade to Tier 2 (agent portal, design handoff screen 5): the rules,
 * apart from the plumbing. Pure, with no imports, so the test suite runs
 * exactly this.
 *
 * An agent picks a Tier 1 self sign-up, MiliPay texts the customer a code,
 * the customer reads it to the agent (proof they are the one in front of
 * them), the agent captures the palm, and the customer is Tier 2 at once.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_RESENDS = 3;
export const RESEND_GAP_MS = 30 * 1000;
/** After the code is right, how long the agent has to capture the palm. */
export const CAPTURE_WINDOW_MS = 15 * 60 * 1000;

export interface UpgradeCandidate {
  status: string | null;
  kyc_tier: number | null;
  nin_verified: boolean | null;
  has_palm_template: boolean | null;
  phone: string | null;
}

/** Why this customer can't be upgraded by an agent, or null when they can. */
export function upgradeRefusal(c: UpgradeCandidate | null): { error: string; status: number; code: string } | null {
  if (!c) return { error: "That customer wasn't found.", status: 404, code: "NOT_FOUND" };
  if (c.status !== "active") return { error: "This account isn't active, so it can't be upgraded.", status: 409, code: "NOT_ACTIVE" };
  if ((c.kyc_tier ?? 0) >= 2) return { error: "This customer is already Tier 2 or higher.", status: 409, code: "ALREADY_UPGRADED" };
  if (c.has_palm_template) return { error: "This customer already has a palm on file.", status: 409, code: "HAS_PALM" };
  if (!c.nin_verified) return { error: "Their NIN isn't verified yet. Register them in full instead.", status: 409, code: "NIN_NOT_VERIFIED" };
  if (!c.phone) return { error: "This customer has no phone number on file.", status: 409, code: "NO_PHONE" };
  return null;
}

export function upgradeSms(code: string, agentName: string): string {
  const first = agentName.trim().split(/\s+/)[0] || "Your agent";
  return `${first} from MiliPay is upgrading your account to Tier 2. Your code is ${code}. Only give it to the agent in front of you. It expires in 10 minutes.`;
}

/** "•••• 4567": the agent sees which phone got the code, not the number. */
export function maskedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}

export interface UpgradeCodeState {
  expires_at: string;
  attempts: number;
  code_verified_at: string | null;
  consumed_at: string | null;
  cancelled_at: string | null;
}

/** Why a code can't be checked any more, or null while it can. */
export function codeClosed(r: UpgradeCodeState, now: Date): string | null {
  if (r.consumed_at) return "This upgrade is already finished.";
  if (r.cancelled_at) return "This code was replaced. Use the newest one.";
  if (r.attempts >= MAX_ATTEMPTS) return "Too many wrong codes. Send a new one.";
  if (new Date(r.expires_at).getTime() <= now.getTime()) return "This code has expired. Send a new one.";
  return null;
}

// ── Register customer: checking the phone with an SMS code ──────────────────

/** After the code is right, how long the agent has to finish the registration. */
export const PHONE_CHECK_WINDOW_MS = 60 * 60 * 1000;

export function phoneCheckSms(code: string): string {
  return `Your MiliPay registration code is ${code}. Give it only to the MiliPay agent registering you. It expires in 10 minutes.`;
}

/** 0803…: the form phone checks are kept in (+234 803… and 803… allowed). */
export function localPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let d = value.replace(/\D/g, "");
  if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  if (d.length === 10 && /^[789]/.test(d)) d = "0" + d;
  return /^0[789][01]\d{8}$/.test(d) ? d : null;
}

export interface PhoneCheckState extends UpgradeCodeState {
  agent_id: string;
  phone: string;
}

/**
 * Why enrol-customer can't use this phone check, or null when it can: it
 * must be this agent's, for this phone, confirmed, unused and recent.
 */
export function phoneCheckRefusal(r: PhoneCheckState | null, agentId: string, phone: string, now: Date): string | null {
  if (!r || r.agent_id !== agentId) return "Check the customer's phone with a code first.";
  if (localPhone(r.phone) !== localPhone(phone)) return "The phone number changed after it was checked. Check it again.";
  if (r.consumed_at) return "That phone check was already used. Check the phone again.";
  if (r.cancelled_at || !r.code_verified_at) return "Check the customer's phone with a code first.";
  if (now.getTime() - new Date(r.code_verified_at).getTime() > PHONE_CHECK_WINDOW_MS) {
    return "The phone check is over an hour old. Check the phone again.";
  }
  return null;
}

/** Why the palm can't be saved against this code yet, or null when it can. */
export function captureClosed(r: UpgradeCodeState, now: Date): string | null {
  if (r.consumed_at) return "This upgrade is already finished.";
  if (r.cancelled_at) return "This code was replaced. Start again.";
  if (!r.code_verified_at) return "Enter the customer's code first.";
  if (now.getTime() - new Date(r.code_verified_at).getTime() > CAPTURE_WINDOW_MS) {
    return "That took too long. Send the customer a new code.";
  }
  return null;
}
