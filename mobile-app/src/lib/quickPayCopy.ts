/**
 * What a customer is told about quick pay on one bank account.
 *
 * No imports, so the test suite runs exactly this.
 *
 * Quick pay is a standing permission for MiliPay to debit a bank account —
 * approved once at the bank, then fingerprint-only. The server decides the
 * state (see supabase/functions/_shared/quick-pay.ts); this only turns it
 * into words, and it never claims quick pay is on when the bank has not yet
 * said so: until then every purchase still asks the bank, and saying
 * otherwise would surprise a customer at the worst moment.
 */

export type QuickPayState = 'off' | 'setting_up' | 'on' | 'paused' | 'failed';
export type QuickPayFailure = 'bank_declined' | 'wrong_account' | 'not_finished';

export interface QuickPayAccountView {
  linkedAccountId: string;
  state: QuickPayState;
  allowance: number | null;
  remaining: number | null;
  /** Set up and the ₦50 received; waiting for the bank to switch it on. */
  bankApproved: boolean;
  failure: QuickPayFailure | null;
}

/** What the one button on the row does. */
export type QuickPayAction = 'turn_on' | 'turn_off' | 'try_again' | 'cancel_setup' | null;

export interface QuickPayCopy {
  title: string;
  detail: string;
  action: QuickPayAction;
  tone: 'ok' | 'pending' | 'bad' | 'neutral';
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export function quickPayCopy(view: QuickPayAccountView): QuickPayCopy {
  switch (view.state) {
    case 'on':
      return {
        title: 'Quick pay is on',
        detail:
          view.remaining !== null && view.allowance !== null
            ? `${naira(view.remaining)} of ${naira(view.allowance)} left. Pay with just your fingerprint.`
            : 'Pay with just your fingerprint.',
        action: 'turn_off',
        tone: 'ok',
      };

    case 'setting_up':
      return view.bankApproved
        ? {
            title: 'Your bank is switching it on',
            detail: 'This can take from a few minutes to a day. Until then, purchases ask your bank as usual.',
            action: null,
            tone: 'pending',
          }
        : {
            title: 'Finish setting up',
            detail:
              "Send ₦50 from this account to the account Mono showed you, within an hour of starting. That's how your bank knows it's you.",
            action: 'cancel_setup',
            tone: 'pending',
          };

    case 'paused':
      return {
        title: 'Quick pay is paused',
        detail: 'Your bank has paused it. Purchases ask your bank each time until it resumes.',
        action: 'turn_off',
        tone: 'pending',
      };

    case 'failed':
      return {
        title:
          view.failure === 'wrong_account'
            ? 'Set up on a different account'
            : view.failure === 'not_finished'
              ? "Setup wasn't finished"
              : "Quick pay wasn't approved",
        detail:
          view.failure === 'wrong_account'
            ? "It was approved on another account, so we didn't use it. Nothing was taken. Try again from this account."
            : view.failure === 'not_finished'
              ? 'Nothing was taken. Start again whenever you are ready.'
              : "Your bank didn't approve it. Nothing was taken. You can try again.",
        action: 'try_again',
        tone: 'bad',
      };

    default:
      return {
        title: 'Quick pay',
        detail: 'Approve once at your bank, then pay with just your fingerprint.',
        action: 'turn_on',
        tone: 'neutral',
      };
  }
}

/**
 * The customer-facing sentence for details Mono needs that we do not have.
 * Names only — the server never sends the values, and neither does this.
 */
export function missingDetailsMessage(missing: string[]): string {
  if (missing.length === 0) return '';
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Your bank needs your ${list} on file before quick pay can be set up. Contact support or the agent who enrolled you to add ${missing.length === 1 ? 'it' : 'them'}.`;
}

/** The short label on the purchase screen's payment card. */
export function paymentMethodLabel(state: QuickPayState | null | undefined): string {
  return state === 'on' ? 'Quick pay' : 'Approve at your bank';
}
