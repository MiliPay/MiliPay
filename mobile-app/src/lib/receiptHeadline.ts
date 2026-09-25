/**
 * The headline of a receipt: what happened, whether it is good news, and
 * whether the money actually left the customer.
 *
 * No imports, so the test suite runs exactly this.
 *
 * Both in-app receipts — the one opened from the home screen and the one in
 * the transaction history — hardcoded a green tick and "Payment Successful!"
 * for every transaction. A payment Mono had refused to start, where nothing
 * was charged, was shown to the customer as a success. The shared PDF receipt
 * reads its status from here too, so the three can never disagree again.
 */
export type ReceiptTone = 'ok' | 'pending' | 'bad';

export interface ReceiptHeadline {
  title: string;
  /** One line under the amount; null when the title says it all. */
  detail: string | null;
  tone: ReceiptTone;
  /**
   * Whether the customer's money has left them (and not come back). Decides
   * the "-" on the amount: a payment that never went through, or one that was
   * refunded, is not shown as a debit.
   */
  charged: boolean;
}

export function receiptHeadline(status: string | null | undefined): ReceiptHeadline {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'delivered':
    case 'success': // legacy rows, from before the state machine
    case 'successful':
      return { title: 'Payment Successful', detail: null, tone: 'ok', charged: true };

    case 'payment_failed':
      return {
        title: "Payment didn't go through",
        detail: 'Nothing was charged.',
        tone: 'bad',
        charged: false,
      };

    case 'initiated':
      return {
        title: 'Waiting for your bank',
        detail: 'Nothing is charged until your bank confirms.',
        tone: 'pending',
        charged: false,
      };

    case 'paid':
    case 'fulfilling':
      return { title: 'In progress', detail: 'Payment confirmed. Sending now…', tone: 'pending', charged: true };

    case 'fulfilment_pending':
      return {
        title: 'In progress',
        detail: 'Confirming with the network. This can take a minute.',
        tone: 'pending',
        charged: true,
      };

    case 'fulfilment_failed':
    case 'refund_pending':
      return { title: 'Not delivered', detail: 'Your refund is on its way.', tone: 'bad', charged: true };

    case 'refunded':
      return { title: 'Refunded', detail: 'Your money has been returned.', tone: 'bad', charged: false };

    case 'refund_failed':
      return { title: 'Refund delayed', detail: 'Our team is on it.', tone: 'bad', charged: true };

    case 'quarantined':
      return { title: 'On hold for review', detail: 'Our team will contact you.', tone: 'bad', charged: true };

    default:
      // An unrecognised status is not a success. Say so plainly rather than
      // guess in either direction.
      return {
        title: 'Status unavailable',
        detail: 'Contact support with the reference below.',
        tone: 'pending',
        charged: false,
      };
  }
}
