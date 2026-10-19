import { supabase } from './supabase';
import type { CodeChannel } from './codeChannelView';

/**
 * Thin client for the `login-code` Edge Function: signing in with an SMS code
 * (design handoff, "I've enrolled, log me in").
 *
 * Decides nothing. The server checks the number, the code and (for an account
 * that is already set up) the PIN, then hands back a one-time sign-in token,
 * which Supabase Auth exchanges for a session here.
 */

async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await supabase.functions.invoke('login-code', { body });
  if (!error) return (data ?? {}) as Record<string, any>;
  // supabase-js leaves a non-2xx body unread on error.context.
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

const message = (body: Record<string, any>, fallback: string) =>
  typeof body.error === 'string' && body.error ? body.error : fallback;

/** The code can't be used any more (expired, used, too many tries): ask again. */
const closed = (body: Record<string, any>) => body.code === 'CODE_CLOSED' || body.code === 'NOT_FOUND';

export type Failure = { ok: false; message: string; closed?: boolean };

export async function requestLoginCode(
  phone: string,
  channel: CodeChannel = 'sms',
): Promise<{ ok: true; requestId: string; sentTo: string } | Failure> {
  const body = await call({ action: 'request', phone, channel });
  if (body.success === true && typeof body.requestId === 'string') {
    return { ok: true, requestId: body.requestId, sentTo: String(body.sentTo ?? '') };
  }
  return { ok: false, message: message(body, "We couldn't send your code. Please try again.") };
}

export async function resendLoginCode(
  requestId: string,
  channel: CodeChannel = 'sms',
): Promise<{ ok: true; sentTo: string } | Failure> {
  const body = await call({ action: 'resend', requestId, channel });
  if (body.success === true) return { ok: true, sentTo: String(body.sentTo ?? '') };
  return { ok: false, message: message(body, "We couldn't send a new code. Please try again."), closed: closed(body) };
}

/** Exchange the server's one-time token for a session. */
async function signIn(tokenHash: unknown): Promise<{ ok: true; step: 'session' } | Failure> {
  if (typeof tokenHash !== 'string' || !tokenHash) {
    return { ok: false, message: 'Could not log you in. Please try again.', closed: true };
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error) return { ok: false, message: 'Could not log you in. Please ask for a new code.', closed: true };
  return { ok: true, step: 'session' };
}

export async function verifyLoginCode(
  requestId: string,
  code: string,
): Promise<{ ok: true; step: 'session' | 'pin' } | Failure> {
  const body = await call({ action: 'verify', requestId, code });
  if (body.success === true && body.step === 'pin') return { ok: true, step: 'pin' };
  if (body.success === true && body.step === 'session') return signIn(body.tokenHash);
  return { ok: false, message: message(body, "That code isn't right. Check it and try again."), closed: closed(body) };
}

export async function submitLoginPin(
  requestId: string,
  pin: string,
): Promise<{ ok: true; step: 'session' } | (Failure & { locked?: boolean })> {
  const body = await call({ action: 'pin', requestId, pin });
  if (body.success === true && body.step === 'session') return signIn(body.tokenHash);
  return {
    ok: false,
    message: message(body, "That PIN isn't right."),
    closed: closed(body) || body.code === 'PIN_LOCKED',
    locked: body.code === 'PIN_LOCKED',
  };
}
