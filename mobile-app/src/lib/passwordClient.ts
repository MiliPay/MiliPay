import { supabase } from './supabase';
import type { CodeChannel } from './codeChannelView';

/**
 * Thin client for the `password` Edge Function (Me › Security › Change
 * password, and "Forgot your current password?"). The server checks the
 * current password, sends the reset code to the account's own number, and
 * signs every other session out after a change.
 */

async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await supabase.functions.invoke('password', { body });
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

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; code?: string };

const failure = (body: Record<string, any>, fallback: string) => ({
  ok: false as const,
  message: typeof body.error === 'string' && body.error ? body.error : fallback,
  code: body.code as string | undefined,
});

export async function changePassword(current: string, password: string): Promise<Result> {
  const body = await call({ action: 'change', current, password });
  return body.success === true ? { ok: true } : failure(body, "Couldn't change your password. Please try again.");
}

export async function requestReset(phone: string, channel: CodeChannel = 'sms'): Promise<Result<{ requestId: string; sentTo: string }>> {
  const body = await call({ action: 'reset_request', phone, channel });
  if (body.success === true) return { ok: true, requestId: body.requestId, sentTo: body.sentTo };
  return failure(body, "We couldn't send a code. Please try again.");
}

export async function resendReset(requestId: string, channel: CodeChannel = 'sms'): Promise<Result> {
  const body = await call({ action: 'reset_resend', requestId, channel });
  return body.success === true ? { ok: true } : failure(body, "We couldn't send a new code. Please try again.");
}

export async function verifyReset(requestId: string, code: string): Promise<Result<{ resetToken: string }>> {
  const body = await call({ action: 'reset_verify', requestId, code });
  if (body.success === true && typeof body.resetToken === 'string') return { ok: true, resetToken: body.resetToken };
  return failure(body, "That code isn't right. Check the SMS and try again.");
}

export async function resetPassword(requestId: string, resetToken: string, password: string): Promise<Result> {
  const body = await call({ action: 'reset', requestId, resetToken, password });
  return body.success === true ? { ok: true } : failure(body, "Couldn't change your password. Please try again.");
}
