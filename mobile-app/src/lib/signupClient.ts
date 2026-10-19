import * as SecureStore from 'expo-secure-store';
import type { CodeChannel } from './codeChannelView';
import { supabase } from './supabase';

/**
 * Thin client for the `signup` Edge Function (self sign-up, Tier 1).
 *
 * Decides nothing: the server checks the phone, the NIN, Smile ID's verdict
 * and the address, and creates the account. What the phone keeps is only the
 * session id and its resume token (in SecureStore), so "Save & exit" and
 * coming back later work; the progress itself lives on the server.
 */

const KEY = 'milipay.signup';

export interface SavedSignup {
  sessionId: string;
  token: string;
}

export async function loadSavedSignup(): Promise<SavedSignup | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.sessionId && parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSignup(s: SavedSignup | null): Promise<void> {
  try {
    if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Losing it only means starting sign-up again.
  }
}

export interface SignupPerson {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
  ninMasked: string | null;
}

export interface SignupView {
  step: 'phone' | 'nin' | 'selfie' | 'confirm' | 'addr' | 'done' | 'review' | 'abandoned';
  stepNumber: number;
  sentTo: string;
  phone: string;
  dateOfBirth: string | null;
  selfie: { attemptsLeft: number; failure: string | null; failureText: string | null };
  person: SignupPerson | null;
  pending?: boolean;
}

export type Failure = { ok: false; message: string; code?: string; loginInstead?: boolean };

async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await supabase.functions.invoke('signup', { body });
  if (!error) return (data ?? {}) as Record<string, any>;
  const response = (error as any)?.context;
  if (response && typeof response.json === 'function') {
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === 'object') return { ...parsed, success: false };
    } catch {
      // fall through
    }
  }
  return { success: false, error: "Couldn't reach MiliPay. Check your connection and try again." };
}

function fail(body: Record<string, any>, fallback: string): Failure {
  return {
    ok: false,
    message: typeof body.error === 'string' && body.error ? body.error : fallback,
    code: body.code,
    // The design's underlined "Log in instead" under these two.
    loginInstead: body.code === 'PHONE_TAKEN' || body.code === 'NIN_TAKEN',
  };
}

function asView(body: Record<string, any>): SignupView {
  return body as unknown as SignupView;
}

export async function startSignup(phone: string, channel: CodeChannel = 'sms'): Promise<{ ok: true; sessionId: string; sentTo: string } | Failure> {
  const body = await call({ action: 'start', phone, channel });
  if (body.success === true && typeof body.sessionId === 'string') return { ok: true, sessionId: body.sessionId, sentTo: body.sentTo };
  return fail(body, "We couldn't send your code. Please try again.");
}

export async function resendSignupCode(sessionId: string, channel: CodeChannel = 'sms'): Promise<{ ok: true } | Failure> {
  const body = await call({ action: 'resend', sessionId, channel });
  return body.success === true ? { ok: true } : fail(body, "We couldn't send a new code. Please try again.");
}

export async function verifySignupPhone(sessionId: string, code: string): Promise<{ ok: true; saved: SavedSignup } | Failure> {
  const body = await call({ action: 'verify_phone', sessionId, code });
  if (body.success === true && typeof body.token === 'string') {
    const saved = { sessionId: body.sessionId, token: body.token };
    await saveSignup(saved);
    return { ok: true, saved };
  }
  return fail(body, "That code isn't right. Check the SMS and try again.");
}

async function step(saved: SavedSignup, action: string, extra: Record<string, unknown> = {}): Promise<{ ok: true; view: SignupView } | Failure> {
  const body = await call({ action, ...saved, ...extra });
  if (body.success === true && typeof body.step === 'string') return { ok: true, view: asView(body) };
  return fail(body, 'Something went wrong. Please try again.');
}

export const signupStatus = (s: SavedSignup) => step(s, 'status');
export const submitNin = (s: SavedSignup, nin: string, dateOfBirth: string) => step(s, 'nin', { nin, dateOfBirth, consent: true });
export const submitSelfieJob = (s: SavedSignup, jobId: string) => step(s, 'selfie', { jobId });
export const selfieStatus = (s: SavedSignup) => step(s, 'selfie_status');
export const confirmPerson = (s: SavedSignup) => step(s, 'confirm');

export interface SmileSession {
  token: string;
  partnerId: string;
  sandbox: boolean;
  callbackUrl: string;
  idInfo: { country: string; idType: string; idNumber: string };
}

export async function smileSession(s: SavedSignup): Promise<{ ok: true; session: SmileSession } | Failure> {
  const body = await call({ action: 'smile_token', ...s });
  if (body.success === true && typeof body.token === 'string') return { ok: true, session: body as unknown as SmileSession };
  return fail(body, 'Selfie checks are unavailable right now. Please try again shortly.');
}

/** The address; on success the account exists and `tokenHash` signs them in. */
export async function submitAddress(
  s: SavedSignup,
  address: { state: string; lga: string; street: string; landmark: string },
): Promise<{ ok: true; tokenHash: string | null } | Failure> {
  const body = await call({ action: 'address', ...s, ...address });
  if (body.success === true && body.step === 'done') return { ok: true, tokenHash: body.tokenHash ?? null };
  return fail(body, "Couldn't create your account. Please try again.");
}

export async function abandonSignup(s: SavedSignup | null): Promise<void> {
  if (s) await call({ action: 'abandon', ...s });
  await saveSignup(null);
}

/** Sign in with the one-time token the server issued for the new account. */
export async function signInNewAccount(tokenHash: string): Promise<boolean> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  return !error;
}
