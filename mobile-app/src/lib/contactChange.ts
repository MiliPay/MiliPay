import { supabase } from './supabase';
import type { CodeChannel } from './codeChannelView';

/**
 * Thin client for the `contact-change` Edge Function: changing email or phone
 * by a code sent to the new one (design handoff, Profile & identity).
 *
 * Decides nothing. The server checks every code, and saves the change — in
 * sign-in and on the profile — only when the last one is right.
 */

export type ContactChannel = 'email' | 'phone';

export interface ContactStep {
  channel: ContactChannel;
  /** Where the code went: the new email, or "0803 123 4567". */
  to: string;
}

/**
 * supabase-js leaves a non-2xx body unread on error.context — see unwrap()
 * in vtuService.ts for why it has to be read with .json().
 */
async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await supabase.functions.invoke('contact-change', { body });
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

const message = (body: Record<string, any>, fallback: string) =>
  typeof body.error === 'string' && body.error ? body.error : fallback;

export type StartResult =
  | { ok: true; requestId: string; steps: ContactStep[] }
  /** `pinWrong`: ask for the PIN again; nothing was sent. */
  | { ok: false; message: string; pinWrong?: boolean };

/**
 * Send a code to each new address. Only the fields that changed are passed.
 * The PIN is checked first (since 2026-10-20); `phoneVia` is how the new
 * number's code comes: SMS (the default), a call or WhatsApp.
 */
export async function startContactChange(
  change: { email?: string; phone?: string },
  pin: string,
  phoneVia: CodeChannel = 'sms',
): Promise<StartResult> {
  const body = await call({ action: 'request', ...change, pin, phoneVia });
  if (body.success === true && typeof body.requestId === 'string' && Array.isArray(body.steps)) {
    return { ok: true, requestId: body.requestId, steps: body.steps };
  }
  return {
    ok: false,
    message: message(body, "We couldn't send your code. Please try again."),
    pinWrong: body.code === 'PIN_INCORRECT' || body.code === 'PIN_LOCKED' || body.code === 'PIN_REQUIRED',
  };
}

export type VerifyResult =
  | { ok: true; done: true; email: string | null; phone: string | null }
  | { ok: true; done: false }
  /** `closed`: the request cannot continue (expired, too many tries) — start again. */
  | { ok: false; message: string; closed: boolean };

export async function verifyContactCode(requestId: string, channel: ContactChannel, code: string): Promise<VerifyResult> {
  const body = await call({ action: 'verify', requestId, channel, code });
  if (body.success === true && body.done === true) {
    return { ok: true, done: true, email: body.email ?? null, phone: body.phone ?? null };
  }
  if (body.success === true) return { ok: true, done: false };
  return {
    ok: false,
    message: message(body, "That code isn't right. Check it and try again."),
    closed: body.code === 'REQUEST_CLOSED' || body.code === 'NOT_FOUND',
  };
}

export async function resendContactCode(
  requestId: string,
  channel: ContactChannel,
  phoneVia: CodeChannel = 'sms',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = await call({ action: 'resend', requestId, channel, phoneVia });
  if (body.success === true) return { ok: true };
  return { ok: false, message: message(body, "We couldn't send a new code. Please try again.") };
}

/** The sheet was closed: nothing is saved. */
export async function cancelContactChange(requestId: string): Promise<void> {
  await call({ action: 'cancel', requestId });
}
