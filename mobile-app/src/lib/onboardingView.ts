import { sentLine, type CodeChannel } from './codeChannelView';
/**
 * The sign-in and first-setup screens' rules and words (design handoff,
 * screens 3 and 4), apart from the screens. Pure, so the test suite runs
 * exactly this.
 */

/** "0803 123 4567" as it is typed (the prototype's fmtPhone). */
export function fmtPhone(digits: string): string {
  return digits.replace(/^(\d{4})(\d{0,3})(\d{0,4}).*/, (_m, a: string, b: string, c: string) =>
    [a, b, c].filter(Boolean).join(' '),
  );
}

/** What the phone box keeps: digits only, at most 11. */
export function phoneDigits(input: string): string {
  return input.replace(/[^0-9]/g, '').slice(0, 11);
}

/** "0803 ••• 4567" under "Welcome back". */
export function maskedPhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) d = '0' + d.slice(3);
  if (d.length < 8) return '';
  return `${d.slice(0, 4)} ••• ${d.slice(-4)}`;
}

/** Step 1's words: the phone, then the code. */
export function stepOneCopy(codeSent: boolean, sentTo: string | null, channel: CodeChannel = 'sms') {
  return codeSent
    ? {
        title: 'Enter the code',
        sub: channel === 'sms' ? `We sent a 6-digit code by SMS to ${sentTo ?? 'your phone'}.` : sentLine(channel, sentTo),
      }
    : {
        title: 'Log in to MiliPay',
        sub: "Enter the phone number you registered with. We'll send you a one-time code.",
      };
}

export function stepOneButton(codeSent: boolean, busy: boolean): string {
  if (busy) return codeSent ? 'Verifying…' : 'Sending code…';
  return codeSent ? 'Verify' : 'Send code';
}

/** "Step 1 of 3" … for create password, PIN and fingerprint. */
export function stepLabel(step: 1 | 2 | 3): string {
  return `Step ${step} of 3`;
}

// ─── Password ───────────────────────────────────────────────────────────────

/** The prototype's score: 0–1. */
export function passwordScore(p: string): number {
  let l = 0;
  if (p.length >= 8) l += 0.3;
  if (p.length >= 12) l += 0.2;
  if (/[A-Za-z]/.test(p) && /[0-9]/.test(p)) l += 0.3;
  if (/[^A-Za-z0-9]/.test(p)) l += 0.2;
  return Math.round(l * 10) / 10;
}

export type StrengthTone = 'brand' | 'warn' | 'fail';

/** How many of the 4 segments light, in what colour, and the word beside them. */
export function passwordStrength(p: string): { segments: number; tone: StrengthTone; label: string } {
  const score = passwordScore(p);
  const tone: StrengthTone = score >= 0.8 ? 'brand' : score >= 0.5 ? 'warn' : 'fail';
  return {
    segments: p ? Math.ceil(score * 4 - 0.001) : 0,
    tone,
    label: !p ? '' : score >= 0.8 ? 'Strong' : score >= 0.5 ? 'Okay' : 'Weak',
  };
}

export function passwordRules(p: string, again: string): { label: string; ok: boolean }[] {
  return [
    { label: 'At least 8 characters', ok: p.length >= 8 },
    { label: 'A letter and a number', ok: /[A-Za-z]/.test(p) && /[0-9]/.test(p) },
    { label: 'Both passwords match', ok: again.length > 0 && p === again },
  ];
}

export function passwordValid(p: string, again: string): boolean {
  return passwordRules(p, again).every((r) => r.ok);
}

// ─── PIN ────────────────────────────────────────────────────────────────────

export function pinCopy(confirming: boolean, signup = false) {
  if (confirming) return { title: 'Enter your PIN again', sub: 'Just to make sure you remember it.' };
  return {
    title: 'Set your 4-digit PIN',
    // A self-registered customer has no palm yet (design: signup pinSub).
    sub: signup
      ? "You'll use it to approve payments and unlock the app."
      : "You'll use it to approve payments when your palm or fingerprint isn't available.",
  };
}

export const PIN_MISMATCH = "The PINs didn't match. Start again.";

/** After a code sign-in to an account that is already set up. */
export const LOGIN_PIN_COPY = {
  title: 'Enter your PIN',
  sub: 'Your account is already set up. Enter your PIN to log in on this phone.',
};

// ─── Upgrade to Tier 2 at an agent ─────────────────────────────────────────

export const ENROL_STEPS = [
  { icon: 'map-pin', colour: '#00C896', title: 'Visit an agent with your NIN', body: 'Find a MiliPay agent near you and bring your NIN slip or card.' },
  { icon: 'hand', colour: '#3B82F6', title: 'Palm vein capture', body: 'The agent scans your palm veins to link your palm to your account.' },
  { icon: 'shield-check', colour: '#A855F7', title: 'Get verified', body: "We text you when your palm is linked and you're on Tier 2." },
  { icon: 'scan', colour: '#F97316', title: 'Pay with your palm', body: 'Pay at any MiliPay terminal with your open hand. No phone or card needed.' },
] as const;

// ─── All set ────────────────────────────────────────────────────────────────

/**
 * The checklist on "You're all set". Only what is true: the palm row only
 * when a palm is on file, the fingerprint row only when it was turned on.
 */
export function doneRows(opts: { hasPalm: boolean; fingerprint: boolean }): { label: string; value: string }[] {
  return [
    ...(opts.hasPalm ? [{ label: 'Palm vein captured', value: 'By your agent' }] : []),
    { label: 'Account verified', value: '' },
    { label: 'Password and PIN set', value: '' },
    ...(opts.fingerprint ? [{ label: 'Fingerprint unlock on', value: '' }] : []),
  ];
}

/** The sign-up version's checklist (design: doneRows when signup). */
export function signupDoneRows(fingerprint: boolean): string[] {
  return [
    'Phone number verified',
    'NIN verified with NIMC',
    'Selfie matched',
    'Password and PIN set',
    ...(fingerprint ? ['Fingerprint unlock on'] : []),
  ];
}

export function allSetCopy(firstName: string, hasPalm: boolean) {
  const name = firstName.trim();
  return {
    title: name ? `You're all set, ${name}` : "You're all set",
    sub: hasPalm
      ? 'Your account is secured and your palm is ready to pay.'
      : 'Your account is secured. Visit a MiliPay agent to add your palm.',
  };
}

export function palmCardCopy(hasPalm: boolean) {
  return hasPalm
    ? { title: 'Palm Pay is active', sub: 'Pay at any MiliPay terminal', live: true }
    : { title: 'Palm Pay is not set up yet', sub: 'An agent can add your palm', live: false };
}

/** Lock the app again after this long in the background. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function shouldLock(backgroundedAt: number | null, now: number, biometricOn: boolean): boolean {
  return biometricOn && backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

// ─── Change password (Me › Security) ────────────────────────────────────────

/**
 * The checklist on Change password (design handoff, screen 9b). In a reset
 * (code verified) there is no current password, so "Different from your
 * current password" is left out.
 */
export function changePasswordRules(current: string, next: string, again: string, reset: boolean): { label: string; ok: boolean }[] {
  const rules = [
    { label: 'At least 8 characters', ok: next.length >= 8 },
    { label: 'A number', ok: /\d/.test(next) },
    { label: 'Different from your current password', ok: !!next && next !== current },
    { label: 'Both new passwords match', ok: !!again && next === again },
  ];
  return reset ? rules.filter((_, i) => i !== 2) : rules;
}

/** Its 4-part bar: one segment each for length, a number, a capital, a symbol. */
export function changePasswordStrength(next: string): { segments: number; colour: string } {
  const score =
    (next.length >= 8 ? 1 : 0) + (/\d/.test(next) ? 1 : 0) + (/[A-Z]/.test(next) ? 1 : 0) + (/[^A-Za-z0-9]/.test(next) ? 1 : 0);
  return { segments: next ? score : 0, colour: score >= 3 ? '#00C896' : score === 2 ? '#FFB454' : '#FF5C5C' };
}

/** "803 123 4567" for the reset's +234 box (the design pre-fills the account's number). */
export function resetPhoneDisplay(localPhone: string): string {
  const d = (localPhone || '').replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
