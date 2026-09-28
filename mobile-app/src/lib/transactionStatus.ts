import { supabase } from './supabase';

/**
 * Following a purchase to its conclusion.
 *
 * A purchase is no longer one blocking request. The customer's part ends at the
 * fingerprint; the bank is then asked for the money, Mono confirms by webhook,
 * and only then is the airtime sent. That is a few real seconds, and the
 * customer has to be able to watch them.
 *
 * Realtime is the primary channel. Polling is the backstop, because a dropped
 * websocket on a Nigerian mobile network is not an edge case — and a customer
 * staring at "Confirming with your bank…" forever, with money gone, is the
 * worst failure this screen has.
 */

export type TransactionStatus =
  | 'initiated'
  | 'payment_failed'
  | 'paid'
  | 'fulfilling'
  | 'fulfilment_pending'
  | 'delivered'
  | 'fulfilment_failed'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed'
  | 'quarantined';

export interface TransactionSnapshot {
  reference: string;
  status: TransactionStatus;
  amount: number;
  token: string | null;
  units: string | null;
  failureReason: string | null;
  updatedAt: string | null;
}

/**
 * Mirrors CUSTOMER_STATUS_COPY in the Edge Function. Deliberately never says
 * "delivered" for a state that has not delivered — telling somebody they have
 * airtime they have not got is the commonest complaint in this business.
 */
export const STATUS_COPY: Record<TransactionStatus, string> = {
  initiated: 'Confirming with your bank…',
  payment_failed: "This payment didn't go through. Nothing was charged.",
  paid: 'Payment confirmed',
  fulfilling: 'Sending…',
  fulfilment_pending: 'Confirming with the network. This can take a minute.',
  delivered: 'Delivered',
  fulfilment_failed: 'The network could not complete this. Your refund is on its way.',
  refund_pending: 'Refunding…',
  refunded: 'Refunded',
  refund_failed: 'Refund delayed — our team is on it.',
  quarantined: 'On hold for review. Our team will contact you.',
};

/** Nothing moves out of these on its own. */
const TERMINAL: TransactionStatus[] = [
  'payment_failed',
  'delivered',
  'refunded',
  'refund_failed',
  'quarantined',
];

export function isTerminal(status: TransactionStatus): boolean {
  return TERMINAL.includes(status);
}

function toSnapshot(row: Record<string, unknown>): TransactionSnapshot {
  return {
    reference: String(row.reference ?? ''),
    status: (row.status as TransactionStatus) ?? 'initiated',
    amount: Number(row.amount) || 0,
    token: (row.token as string) ?? null,
    units: (row.units as string) ?? null,
    failureReason: (row.failure_reason as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export interface WatchOptions {
  reference: string;
  onUpdate: (snapshot: TransactionSnapshot) => void;
  /** Called once the transaction reaches a state it will not leave. */
  onSettled: (snapshot: TransactionSnapshot) => void;
  /**
   * Stop watching after this long even if nothing settled. The transaction
   * carries on server-side; only the screen gives up.
   */
  timeoutMs?: number;
}

/**
 * Watches one transaction. Returns a cancel function — call it on unmount, or
 * the subscription and the poll both outlive the screen.
 */
export function watchTransaction(options: WatchOptions): () => void {
  const { reference, onUpdate, onSettled } = options;
  const timeoutMs = options.timeoutMs ?? 180_000;

  let finished = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  let giveUp: ReturnType<typeof setTimeout> | null = null;

  const settle = (snapshot: TransactionSnapshot) => {
    if (finished) return;
    finished = true;
    cleanup();
    onSettled(snapshot);
  };

  const handle = (snapshot: TransactionSnapshot) => {
    if (finished) return;
    onUpdate(snapshot);
    if (isTerminal(snapshot.status)) settle(snapshot);
  };

  const channel = supabase
    .channel(`tx_${reference}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'transactions',
        filter: `reference=eq.${reference}`,
      },
      (payload) => handle(toSnapshot(payload.new as Record<string, unknown>)),
    )
    .subscribe();

  const readOnce = async () => {
    if (finished) return;
    // Straight from the table rather than through the Edge Function: RLS
    // already restricts this to the customer's own rows, and one fewer hop
    // matters when this runs every couple of seconds.
    const { data } = await supabase
      .from('transactions')
      .select('reference, status, amount, token, units, failure_reason, updated_at')
      .eq('reference', reference)
      .maybeSingle();

    if (data) handle(toSnapshot(data as Record<string, unknown>));
  };

  function cleanup() {
    if (poll) clearInterval(poll);
    if (giveUp) clearTimeout(giveUp);
    poll = null;
    giveUp = null;
    supabase.removeChannel(channel);
  }

  // Backstop. Realtime carries this normally; the poll is here for the
  // websocket that quietly died on a patchy connection.
  poll = setInterval(readOnce, 2_500);
  void readOnce();

  giveUp = setTimeout(() => {
    if (finished) return;
    finished = true;
    cleanup();
    // Not a failure, and not reported as one. The transaction is still
    // running server-side and reconciliation will finish it; we have simply
    // stopped watching.
    void supabase
      .from('transactions')
      .select('reference, status, amount, token, units, failure_reason, updated_at')
      .eq('reference', reference)
      .maybeSingle()
      .then(({ data }) => {
        if (data) onSettled(toSnapshot(data as Record<string, unknown>));
      });
  }, timeoutMs);

  return () => {
    if (finished) return;
    finished = true;
    cleanup();
  };
}
