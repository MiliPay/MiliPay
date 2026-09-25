/**
 * What the "Payment account" section of a purchase screen should show.
 *
 * No imports, so the test suite can run exactly this.
 *
 * It exists because the answer used to be `accounts.length > 1 ? list :
 * "No bank account linked"` — so a customer with exactly ONE linked bank, the
 * commonest case there is, was told they had none. And "none" was also what an
 * empty list meant while the accounts were still loading, or after the load
 * had failed, so the screen could claim a bank was missing that was simply not
 * fetched yet.
 *
 * "No bank account linked" is now said only when a load has actually finished
 * and found nothing.
 */
export type PaymentAccountView = 'list' | 'loading' | 'error' | 'none';

export function paymentAccountView(state: {
  count: number;
  isLoading: boolean;
  error: string | null;
}): PaymentAccountView {
  // Any account at all is shown, including a single one.
  if (state.count > 0) return 'list';
  if (state.isLoading) return 'loading';
  if (state.error) return 'error';
  return 'none';
}
