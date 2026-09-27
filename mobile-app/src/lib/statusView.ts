/**
 * How a transaction's state is drawn in the redesign: the chip on a list row,
 * the headline on a receipt or detail sheet, and the step reached on the
 * progress sheet.
 *
 * No imports, so the test suite runs exactly this. Ported from the
 * prototype's `rowStatus()`, `headline()` and progress `stepsDef`
 * (design_handoff_milipay_redesign). The words under each headline are
 * STATUS_COPY in transactionStatus.ts, which mirrors the server word for word.
 */

export type Tone = 'ok' | 'warn' | 'fail' | 'muted';

/** A list row's chip, or null for a delivered purchase (no chip). */
export function rowStatus(status: string | null | undefined): { label: string; tone: Exclude<Tone, 'ok'> } | null {
  switch (status) {
    case 'delivered':
    case 'success': // legacy rows, from before the state machine
    case 'successful':
    case undefined:
    case null:
      return null;
    case 'payment_failed':
      return { label: 'Payment failed', tone: 'fail' };
    case 'fulfilment_failed':
      return { label: 'Failed', tone: 'fail' };
    case 'refund_failed':
      return { label: 'Refund delayed', tone: 'fail' };
    case 'quarantined':
      return { label: 'On hold', tone: 'fail' };
    case 'refunded':
      return { label: 'Refunded', tone: 'muted' };
    case 'refund_pending':
      return { label: 'Refunding', tone: 'warn' };
    default:
      return { label: 'In progress', tone: 'warn' };
  }
}

/** Money that never left the customer, or came back: shown struck through. */
export function isReturned(status: string | null | undefined): boolean {
  return status === 'payment_failed' || status === 'refunded';
}

export type HeadlineIcon = 'check' | 'x' | 'alert' | 'refresh' | 'clock';

/**
 * The receipt / detail headline. Only a delivered purchase is a success; an
 * unknown status is "In progress", never a guessed success.
 */
export function statusHeadline(status: string | null | undefined): { title: string; icon: HeadlineIcon; tone: Tone } {
  if (status === 'delivered' || status === 'success' || status === 'successful') {
    return { title: 'Delivered', icon: 'check', tone: 'ok' };
  }
  if (status === 'payment_failed') return { title: 'Payment failed', icon: 'x', tone: 'fail' };
  if (status === 'fulfilment_failed' || status === 'refund_failed' || status === 'quarantined') {
    return { title: rowStatus(status)!.label, icon: 'alert', tone: 'fail' };
  }
  if (status === 'refunded') return { title: 'Refunded', icon: 'refresh', tone: 'muted' };
  return { title: 'In progress', icon: 'clock', tone: 'warn' };
}

/** The progress sheet's four steps, in order. */
export const PROGRESS_STEPS = ['Paying from your bank', 'Payment confirmed', 'Sending to provider', 'Delivered'] as const;

/**
 * How far along a purchase is, 0–3, for the progress sheet. 3 means every
 * step is done (delivered). Anything that ended badly stops where it was, so
 * the sheet never shows a tick against a step that did not happen.
 */
export function progressIndex(status: string | null | undefined): number {
  switch (status) {
    case 'initiated':
    case 'payment_failed':
      return 0;
    case 'paid':
      return 1;
    case 'fulfilling':
    case 'fulfilment_pending':
    case 'fulfilment_failed':
    case 'refund_pending':
    case 'refunded':
    case 'refund_failed':
    case 'quarantined':
      return 2;
    case 'delivered':
      return 3;
    default:
      return 0;
  }
}
