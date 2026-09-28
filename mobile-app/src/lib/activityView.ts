/**
 * The rules behind Home's Recent list, the Activity tab and the Notifications
 * screen, apart from their pixels.
 *
 * Pure (it imports only other pure modules), so the test suite runs exactly
 * this. Ported from the redesign's logic script (design_handoff_milipay_redesign:
 * `decorate`, the Activity filters, `txGroups`, `NOTIFS`/`NTONE`) and joined to
 * what the database actually holds.
 */

import { formatPhone, normaliseLocalPhone } from './purchaseForm';
import { rowStatus } from './statusView';

// ─────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────

/** What a history row needs. Matches the columns the store reads. */
export interface TxLike {
  status: string;
  amount: number | string;
  created_at: string;
  merchant_name?: string | null;
  service_type?: string | null;
  beneficiary?: string | null;
  merchant_id?: string | null;
  terminal_id?: string | null;
  account_used?: string | null;
}

export type TxService = 'airtime' | 'data' | 'power' | 'cable' | 'palm' | 'other';

/**
 * What a transaction was, for its icon and colour. A merchant terminal's
 * payment is a palm payment. Rows from before the payment rail carry no
 * service_type, so their names are read instead; anything still unclear is
 * `other` rather than a guess dressed up as a service.
 */
export function txService(tx: TxLike): TxService {
  if (tx.merchant_id || tx.terminal_id) return 'palm';
  switch (tx.service_type) {
    case 'airtime':
    case 'data':
    case 'power':
    case 'cable':
      return tx.service_type;
  }
  const name = (tx.merchant_name ?? '').toLowerCase();
  if (/electric|ikedc|ekedc|aedc|ibedc|phed|eedc|kedco|jed|meter/.test(name)) return 'power';
  if (/dstv|gotv|startimes|showmax|cable/.test(name)) return 'cable';
  if (/\bdata\b|\d+(\.\d+)?\s*(gb|mb|tb)\b/.test(name)) return 'data';
  if (/airtime/.test(name)) return 'airtime';
  return 'other';
}

/** Who or what it went to, as the detail sheet shows it. */
export function recipientLabel(tx: TxLike): string | null {
  const to = (tx.beneficiary ?? '').trim();
  if (!to) return null;
  switch (txService(tx)) {
    case 'airtime':
    case 'data':
      return formatPhone(normaliseLocalPhone(to));
    case 'power':
      return `Meter ${to}`;
    case 'cable':
      return `Smartcard ${to}`;
    default:
      return to;
  }
}

/** "GTBank ••6789" — the prototype's `last4`. */
export function bankLabel(bankName: string, accountNumber: string): string {
  return `${bankName} ••${String(accountNumber).slice(-4)}`;
}

/**
 * True once the money has actually left the customer's bank and not come
 * back: not while their bank is still being asked (initiated), not for a
 * payment that never went through, not after a refund. An unknown status is
 * not counted — the summary must not claim money was spent that may not have
 * been.
 */
export function moneyLeft(status: string | null | undefined): boolean {
  switch (status) {
    case 'paid':
    case 'fulfilling':
    case 'fulfilment_pending':
    case 'delivered':
    case 'fulfilment_failed':
    case 'refund_pending':
    case 'refund_failed':
    case 'quarantined':
    case 'success': // legacy rows, from before the state machine
    case 'successful':
      return true;
    default:
      return false;
  }
}

export type ActivityFilter = 'all' | 'bills' | 'palm' | 'issues';

/** The Activity tab's first chip row (the prototype's `filters`). */
export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'bills', label: 'Bills' },
  { value: 'palm', label: 'Palm' },
  { value: 'issues', label: 'Needs attention' },
];

export function matchesFilter(tx: TxLike, filter: ActivityFilter): boolean {
  const palm = txService(tx) === 'palm';
  switch (filter) {
    case 'bills':
      return !palm;
    case 'palm':
      return palm;
    case 'issues':
      // Anything that wears a chip: in progress, failed, refunding, refunded,
      // on hold. A delivered purchase needs nothing from anyone.
      return rowStatus(tx.status) !== null;
    default:
      return true;
  }
}

/** Second chip row: `null` is "All accounts". */
export function matchesAccount(tx: TxLike, accountId: string | null): boolean {
  return accountId === null || tx.account_used === accountId;
}

// ─────────────────────────────────────────────────────────────
// Dates, in the design's words
// ─────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function yesterdayOf(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d;
}

/** "9:12 AM". Built by hand so it reads the same on every phone. */
export function clockLabel(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier';

export function dayGroup(iso: string, now: Date = new Date()): DayGroup {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterdayOf(now))) return 'Yesterday';
  return 'Earlier';
}

/** A row's time: "Today, 9:12 AM" · "Yesterday, 1:22 PM" · "Sep 23, 6:48 PM". */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const group = dayGroup(iso, now);
  if (group !== 'Earlier') return `${group}, ${clockLabel(d)}`;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}, ${clockLabel(d)}`;
}

/** A notification's time: "7:41 AM" today, "Yesterday", then "Sep 23". */
export function notifTimeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const group = dayGroup(iso, now);
  if (group === 'Today') return clockLabel(d);
  if (group === 'Yesterday') return 'Yesterday';
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
}

/**
 * The words over a bank card's balance. The figure is read from the bank when
 * the account is linked and not refreshed after, so calling a weeks-old
 * number "Available balance" would be untrue: it says so only while the
 * reading is minutes old, and otherwise names the day it was taken.
 */
export function balanceCaption(asOf: string | null | undefined, now: Date = new Date()): string {
  if (!asOf) return 'Balance when linked';
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return 'Balance when linked';
  if (now.getTime() - d.getTime() <= 15 * 60 * 1000) return 'Available balance';
  if (sameDay(d, now)) return `Balance at ${clockLabel(d)} today`;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `Balance on ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
}

/** Today / Yesterday / Earlier, in list order, empty groups left out. */
export function groupByDay<T extends { created_at: string }>(
  items: T[],
  now: Date = new Date(),
): { title: DayGroup; items: T[] }[] {
  const groups: Record<DayGroup, T[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) groups[dayGroup(item.created_at, now)].push(item);
  return (['Today', 'Yesterday', 'Earlier'] as DayGroup[])
    .map((title) => ({ title, items: groups[title] }))
    .filter((g) => g.items.length > 0);
}

/**
 * The Activity summary card: "Spent in September" and "Palm payments", for
 * this calendar month and the chosen account. Only money that actually left
 * (see moneyLeft) counts; a failed or refunded payment is not spending.
 */
export function monthSummary(
  txs: TxLike[],
  accountId: string | null,
  now: Date = new Date(),
): { monthName: string; spent: number; palm: number } {
  let spent = 0;
  let palm = 0;
  for (const tx of txs) {
    const d = new Date(tx.created_at);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    if (!matchesAccount(tx, accountId) || !moneyLeft(tx.status)) continue;
    const amount = Number(tx.amount) || 0;
    spent += amount;
    if (txService(tx) === 'palm') palm += amount;
  }
  return { monthName: MONTH_NAMES[now.getMonth()], spent: round2(spent), palm: round2(palm) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────

export interface NotificationLike {
  kind: 'payment' | 'palm' | 'security' | string;
  status: string | null;
  created_at: string;
  read_at: string | null;
}

export type NotifFilter = 'all' | 'pay' | 'palm' | 'security';

/** The Notifications screen's chips (the prototype's `notifFilters`). */
export const NOTIF_FILTERS: { value: NotifFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pay', label: 'Payments' },
  { value: 'palm', label: 'Palm' },
  { value: 'security', label: 'Security' },
];

export function notifMatches(n: NotificationLike, filter: NotifFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pay') return n.kind === 'payment';
  return n.kind === filter;
}

export type NotifIcon = 'check' | 'hand' | 'clock' | 'x' | 'alert' | 'refresh' | 'shield';
export type NotifTone = 'ok' | 'palm' | 'warn' | 'fail' | 'muted' | 'blue';

/**
 * A notification's tinted icon (the prototype's NTONE). Payments follow the
 * same rule as every other status drawing: only delivered is the green tick.
 */
export function notifVisual(n: NotificationLike): { icon: NotifIcon; tone: NotifTone } {
  if (n.kind === 'security') return { icon: 'shield', tone: 'blue' };
  switch (n.status) {
    case 'delivered':
      return n.kind === 'palm' ? { icon: 'hand', tone: 'palm' } : { icon: 'check', tone: 'ok' };
    case 'payment_failed':
      return { icon: 'x', tone: 'fail' };
    case 'fulfilment_failed':
    case 'refund_failed':
    case 'quarantined':
      return { icon: 'alert', tone: 'fail' };
    case 'refunded':
      return { icon: 'refresh', tone: 'muted' };
    default:
      return { icon: 'clock', tone: 'warn' };
  }
}

/** Today / Earlier — the design groups notifications in two. */
export function notifGroups<T extends { created_at: string }>(
  items: T[],
  now: Date = new Date(),
): { title: 'Today' | 'Earlier'; items: T[] }[] {
  const today = items.filter((n) => dayGroup(n.created_at, now) === 'Today');
  const earlier = items.filter((n) => dayGroup(n.created_at, now) !== 'Today');
  return [
    { title: 'Today' as const, items: today },
    { title: 'Earlier' as const, items: earlier },
  ].filter((g) => g.items.length > 0);
}

export function unreadCount(items: NotificationLike[]): number {
  return items.reduce((n, item) => n + (item.read_at ? 0 : 1), 0);
}
