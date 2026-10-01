/**
 * Signing in with an SMS code: the rules, apart from the plumbing. Pure, with
 * no imports, so the test suite runs exactly this.
 *
 * The design (handoff, "I've enrolled, log me in"): the customer enters the
 * phone number they gave their agent, gets a 6-digit code by SMS, and is in.
 * First sign-in then goes on to create a password, a PIN and fingerprint.
 *
 * One departure, for safety: a customer who has already set up their account
 * (PIN set, onboarding finished) must also enter their PIN after the code.
 * An SMS code alone would let anyone with a swapped SIM into a funded account.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_RESENDS = 3;
export const RESEND_GAP_MS = 30 * 1000;
/** After the code is right, how long the customer has to enter their PIN. */
export const PIN_WINDOW_MS = 5 * 60 * 1000;

/** A Nigerian mobile number in customers.phone's form: 0803… */
export const LOCAL_PHONE_RE = /^0[789][01]\d{8}$/;

/** +234 803…, 234803…, 803… and 0803… all become 0803…, or null. */
export function loginPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) digits = "0" + digits.slice(3);
  if (digits.length === 10 && /^[789]/.test(digits)) digits = "0" + digits;
  return LOCAL_PHONE_RE.test(digits) ? digits : null;
}

/** "+234 803 123 4567", as the code screen says where it sent the code. */
export function sentTo(localPhone: string): string {
  const d = localPhone.slice(1);
  return `+234 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export function loginSms(code: string): string {
  return `Your MiliPay login code is ${code}. It expires in 10 minutes. MiliPay will never call or text to ask for it.`;
}

/** Sent when an administrator approves an enrolment (no password any more). */
export function verifiedNotice(firstName: string): string {
  const name = firstName.trim() || "there";
  return (
    `Hello ${name}, your MiliPay account is verified. ` +
    `Open the MiliPay app, tap "I've enrolled, log me in" and enter this phone number. ` +
    `We'll text you a code to log in. MiliPay will never ask you for that code.`
  );
}

export function verifiedEmailSubject(): string {
  return "Your MiliPay account is verified";
}

export function verifiedEmailText(firstName: string, localPhone: string): string {
  const name = firstName.trim() || "there";
  return (
    `Hello ${name},\n\n` +
    "Your MiliPay account is verified and ready to use.\n\n" +
    `Open the MiliPay app, tap "I've enrolled, log me in" and enter ${localPhone}, ` +
    "the phone number you gave your agent. We'll text you a code to log in, " +
    "then you'll create your password and PIN.\n\n" +
    "MiliPay will never ask you for your code, password or PIN."
  );
}

export interface LoginCodeState {
  expires_at: string;
  attempts: number;
  needs_pin: boolean;
  code_verified_at: string | null;
  consumed_at: string | null;
  cancelled_at: string | null;
}

/** Why a code can no longer be used, or null while it can. */
export function codeClosed(r: LoginCodeState, now: Date): string | null {
  if (r.consumed_at) return "This code has already been used. Ask for a new one.";
  if (r.cancelled_at) return "This code is no longer valid. Ask for a new one.";
  if (new Date(r.expires_at).getTime() <= now.getTime()) return "That code has expired. Ask for a new one.";
  if ((Number(r.attempts) || 0) >= MAX_ATTEMPTS) return "Too many wrong codes. Ask for a new one.";
  return null;
}

/** The code was right and this account still needs its PIN, within the window. */
export function awaitingPin(r: LoginCodeState, now: Date): boolean {
  if (!r.needs_pin || !r.code_verified_at) return false;
  return now.getTime() - new Date(r.code_verified_at).getTime() <= PIN_WINDOW_MS;
}

/**
 * Who may get a code. Only an approved (active) customer with a sign-in
 * identity: pending enrolments are still being checked, and anything else
 * (suspended, rejected) must go through support.
 */
export function signInRefusal(
  customer: { status: string | null; auth_user_id: string | null } | null,
): { status: number; code: string; error: string } | null {
  if (!customer || customer.status === "pending" || (customer.status === "active" && !customer.auth_user_id)) {
    return {
      status: 404,
      code: "NOT_VERIFIED",
      error:
        "We couldn't find a verified MiliPay account for this number. If you enrolled recently, it may still be being checked.",
    };
  }
  if (customer.status !== "active") {
    return {
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      error: "This account can't log in right now. Please contact support@milipay.ng.",
    };
  }
  return null;
}

/** The PIN step's answer to verify_customer_pin's codes. */
export function pinRefusal(result: { code?: string; attemptsRemaining?: number }): string {
  if (result.code === "PIN_LOCKED") return "Too many wrong PINs. Your PIN is locked for 15 minutes.";
  if (result.code === "PIN_NOT_SET") return "This account has no PIN yet. Contact support@milipay.ng.";
  const left = Number(result.attemptsRemaining) || 0;
  return `That PIN isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`;
}
