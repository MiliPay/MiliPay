import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import type { QuickPayAccountView } from './quickPayCopy';

/**
 * Thin client for the `mono-mandate` Edge Function: quick pay's status,
 * setup and switch-off.
 *
 * Holds no Mono credentials and decides nothing. Whether an account may be
 * debited without a trip to the bank is decided by the server from Mono's
 * own confirmation; anything decided here could be changed by repacking the
 * app.
 */

export interface QuickPayStatus {
  /** Whether quick pay is offered at all. When false, show nothing. */
  available: boolean;
  allowances: number[];
  /** Details Mono needs that we lack, by name. Never the values. */
  missingDetails: string[];
  accounts: QuickPayAccountView[];
}

const UNAVAILABLE: QuickPayStatus = { available: false, allowances: [], missingDetails: [], accounts: [] };

/**
 * supabase-js leaves a non-2xx body unread on error.context — see unwrap()
 * in vtuService.ts for why it has to be read with .json().
 */
async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await supabase.functions.invoke('mono-mandate', { body });
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
  return { success: false, error: 'Quick pay is unavailable right now.' };
}

export async function getQuickPayStatus(): Promise<QuickPayStatus> {
  const body = await call({ action: 'status' });
  if (body.success !== true) return UNAVAILABLE;
  return {
    available: body.available === true,
    allowances: Array.isArray(body.allowances) ? body.allowances : [],
    missingDetails: Array.isArray(body.missingDetails) ? body.missingDetails : [],
    accounts: Array.isArray(body.accounts) ? body.accounts : [],
  };
}

export type StartResult =
  | { ok: true; authorisationUrl: string }
  | { ok: false; message: string; missing?: string[] };

export async function startQuickPay(linkedAccountId: string, allowance: number): Promise<StartResult> {
  const body = await call({ action: 'setup', linkedAccountId, allowance });
  if (body.success === true && typeof body.authorisationUrl === 'string') {
    return { ok: true, authorisationUrl: body.authorisationUrl };
  }
  return {
    ok: false,
    message: typeof body.error === 'string' ? body.error : "Quick pay couldn't be set up right now.",
    missing: Array.isArray(body.missing) ? body.missing : undefined,
  };
}

export async function stopQuickPay(linkedAccountId: string): Promise<boolean> {
  const body = await call({ action: 'cancel', linkedAccountId });
  return body.success === true;
}

/**
 * Quick pay status, refreshed whenever the app comes back to the foreground —
 * which is exactly when it changes: the customer has just been to Mono's page
 * and their bank app to send the ₦50.
 */
export function useQuickPay(enabled = true) {
  const [status, setStatus] = useState<QuickPayStatus>(UNAVAILABLE);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getQuickPayStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  const forAccount = useCallback(
    (linkedAccountId: string | undefined | null) =>
      status.accounts.find((a) => a.linkedAccountId === linkedAccountId) ?? null,
    [status],
  );

  return { status, loading, refresh, forAccount };
}
