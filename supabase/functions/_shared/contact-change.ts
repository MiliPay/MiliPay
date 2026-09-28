/**
 * Changing a customer's email or phone number: the rules, apart from the
 * plumbing. Pure, with no imports, so the test suite runs exactly this.
 *
 * The design (handoff, screen 10): on Save the app sends a 6-digit code to
 * the NEW email and/or phone; a sheet asks for each code in turn ("Code 1 of
 * 2"); nothing is saved until every code is right; closing the sheet discards
 * the change. A verified phone becomes the number the customer signs in with.
 */

/** The prototype's own checks (saveProfile). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^0[789][01]\d{8}$/;

/** How long a code lives, and how many tries and re-sends it gets. */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_RESENDS = 3;
export const RESEND_GAP_MS = 30 * 1000;

export type Channel = "email" | "phone";

export interface ContactChange {
  email: string | null;
  phone: string | null;
}

export type ValidationResult =
  | { ok: true; change: ContactChange }
  | { ok: false; error: string; code: string };

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** +234 803…, 234803… and 0803… all become 0803… (customers.phone's form). */
export function normalisePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) digits = "0" + digits.slice(3);
  return digits;
}

/** The sign-in form Supabase Auth keeps: +2348031234567. */
export function authPhone(localPhone: string): string {
  return "+234" + normalisePhone(localPhone).slice(1);
}

/** "0803 123 4567" — how the sheet names the number it sent to. */
export function displayPhone(localPhone: string): string {
  const d = normalisePhone(localPhone);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
}

/**
 * What actually changes. A field that matches what is on file is not a
 * change — it gets no code and is not touched.
 */
export function validateContactChange(
  requested: { email?: string | null; phone?: string | null },
  current: { email: string | null; phone: string | null },
): ValidationResult {
  const email = requested.email ? normaliseEmail(requested.email) : null;
  const phone = requested.phone ? normalisePhone(requested.phone) : null;

  const emailChanged = !!email && email !== normaliseEmail(current.email ?? "");
  const phoneChanged = !!phone && phone !== normalisePhone(current.phone ?? "");

  if (!emailChanged && !phoneChanged) {
    return { ok: false, error: "Nothing to change.", code: "NO_CHANGE" };
  }
  if (emailChanged && !EMAIL_RE.test(email!)) {
    return { ok: false, error: "Enter a valid email address.", code: "INVALID_EMAIL" };
  }
  if (phoneChanged && !PHONE_RE.test(phone!)) {
    return { ok: false, error: "Enter a valid 11-digit Nigerian phone number.", code: "INVALID_PHONE" };
  }
  return { ok: true, change: { email: emailChanged ? email : null, phone: phoneChanged ? phone : null } };
}

/** The order the sheet asks in: email first, then phone (the prototype's queue). */
export function channelsFor(change: ContactChange): Channel[] {
  return [...(change.email ? ["email" as const] : []), ...(change.phone ? ["phone" as const] : [])];
}

/** Six digits from a random 32-bit number, leading zeros kept. */
export function codeFrom(random: number): string {
  return String(Math.abs(Math.trunc(random)) % 1_000_000).padStart(6, "0");
}

export function smsMessage(code: string): string {
  return `Your MiliPay code is ${code}. It confirms this number for your MiliPay account and expires in 10 minutes. MiliPay will never ask you for it.`;
}

export function emailSubject(): string {
  return "Your MiliPay code";
}

export function emailText(code: string): string {
  return (
    `Your MiliPay code is ${code}.\n\n` +
    "Enter it in the app to confirm this email address for your MiliPay account. " +
    "It expires in 10 minutes.\n\n" +
    "If you didn't ask for this, you can ignore this email. MiliPay will never ask you for this code."
  );
}

export interface RequestState {
  expires_at: string;
  applied_at: string | null;
  cancelled_at: string | null;
  attempts: number;
  new_email: string | null;
  new_phone: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
}

/** Why a request can no longer be used, or null while it can. */
export function requestClosed(r: RequestState, now: Date): string | null {
  if (r.applied_at) return "This change has already been saved.";
  if (r.cancelled_at) return "This change was cancelled. Start again from your profile.";
  if (new Date(r.expires_at).getTime() <= now.getTime()) return "That code has expired. Start again from your profile.";
  if ((Number(r.attempts) || 0) >= MAX_ATTEMPTS) return "Too many wrong codes. Start again from your profile.";
  return null;
}

/** Every channel the request asked for has been verified. */
export function allVerified(r: RequestState): boolean {
  return (!r.new_email || !!r.email_verified_at) && (!r.new_phone || !!r.phone_verified_at);
}

/** The next channel still waiting for its code, or null. */
export function nextChannel(r: RequestState): Channel | null {
  if (r.new_email && !r.email_verified_at) return "email";
  if (r.new_phone && !r.phone_verified_at) return "phone";
  return null;
}
