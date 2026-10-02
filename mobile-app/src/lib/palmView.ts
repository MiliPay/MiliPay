/**
 * The Palm tab's words and numbers (design handoff, screen 7), apart from the
 * screen. Pure, so the test suite runs exactly this.
 */

export interface PalmAccount {
  id: string;
  bankName: string;
  last4: string;
}

/** What get_my_palm answers. */
export interface PalmState {
  hasPalm: boolean;
  paused: boolean;
  enrolledAt: string | null;
  agentName: string | null;
  spentToday: number;
  account: PalmAccount | null;
}

export function palmFromRpc(data: any): PalmState | null {
  if (!data || data.found === false) return null;
  const a = data.account;
  return {
    hasPalm: Boolean(data.hasPalm),
    paused: Boolean(data.paused),
    enrolledAt: data.enrolledAt ?? null,
    agentName: data.agentName ?? null,
    spentToday: Number(data.spentToday) || 0,
    account: a && a.id ? { id: String(a.id), bankName: String(a.bankName ?? ''), last4: String(a.last4 ?? '') } : null,
  };
}

/** The chip beside "Palm Pay". */
export function palmChip(
  p: Pick<PalmState, 'paused' | 'hasPalm'>,
  tier = 2,
): { label: string; tone: 'brand' | 'warn' | 'muted' | 'gold' } {
  if (!p.hasPalm) return tier === 1 ? { label: 'Tier 1', tone: 'gold' } : { label: 'Not set up', tone: 'muted' };
  return p.paused ? { label: 'Paused', tone: 'warn' } : { label: 'Active', tone: 'brand' };
}

/** The hero's opening line. */
export function palmHeroLine(p: Pick<PalmState, 'paused' | 'hasPalm'>): string {
  if (!p.hasPalm) return 'You can pay bills and buy airtime and data now. To pay at MiliPay terminals with your palm, add it at an agent.';
  return p.paused
    ? 'Palm payments are paused. Terminals will decline your palm until you switch this back on.'
    : 'Pay at any MiliPay terminal with your open hand. No phone, card or PIN needed.';
}

export function palmStatusTitle(p: Pick<PalmState, 'paused' | 'hasPalm'>): string {
  if (!p.hasPalm) return 'No palm on file yet';
  return p.paused ? 'Palm paused' : 'Your palm is ready to pay';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Enrolled Sep 12, 2026 · Agent: Yaba Hub" — only the parts that are known. */
export function enrolledLine(enrolledAt: string | null, agentName: string | null): string {
  const parts: string[] = [];
  if (enrolledAt) {
    const d = new Date(enrolledAt);
    if (!Number.isNaN(d.getTime())) parts.push(`Enrolled ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
  }
  if (agentName && agentName.trim()) parts.push(`Agent: ${agentName.trim()}`);
  return parts.join(' · ');
}

const naira0 = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

/** "₦12,450 of ₦50,000" and how full the bar is (0–100). */
export function palmToday(spent: number, dailyLimit: number): { label: string; pct: number } {
  const limit = Math.max(0, dailyLimit);
  return {
    label: `${naira0(spent)} of ${naira0(limit)}`,
    pct: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0,
  };
}

/** Tapping "Change" moves to the next linked account, as the prototype does. */
export function nextPalmAccount<T extends { id: string }>(accounts: T[], currentId: string | null): T | null {
  if (accounts.length < 2) return null;
  const i = accounts.findIndex((a) => a.id === currentId);
  return accounts[(i + 1) % accounts.length];
}

export const PALM_STEPS = [
  { n: 1, text: 'Hold your open palm over the scanner' },
  { n: 2, text: 'Check the amount on the screen' },
  { n: 3, text: 'Paid. We send you an alert' },
] as const;
