/**
 * Help & support and the chat (design handoff, screen 14), apart from their
 * pixels. Pure, so the test suite runs exactly this.
 *
 * A ticket's state is read from the columns staff actually move: status
 * (open → in_progress → resolved), is_escalated, and assigned_to.
 */

export interface TicketLike {
  status: string;
  is_escalated?: boolean | null;
  assigned_to?: string | null;
}

export type SupportState = 'waiting' | 'in_progress' | 'escalated' | 'resolved';

export function supportState(t: TicketLike): SupportState {
  if (t.status === 'resolved') return 'resolved';
  if (t.is_escalated) return 'escalated';
  if (t.status === 'in_progress' || t.assigned_to) return 'in_progress';
  return 'waiting';
}

export type BadgeTone = 'blue' | 'brand' | 'warn' | 'muted';

/** The conversation card's badge (the prototype's BADGE table). */
export const SUPPORT_BADGE: Record<SupportState, { label: string; tone: BadgeTone }> = {
  waiting: { label: 'Waiting for agent', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'brand' },
  escalated: { label: 'Escalated to admin', tone: 'warn' },
  resolved: { label: 'Solved', tone: 'muted' },
};

/** The chat header's status line (the prototype's chatStatus). */
export const CHAT_STATUS: Record<SupportState, string> = {
  waiting: 'Waiting for agent',
  in_progress: 'Agent active',
  escalated: 'Escalated to admin',
  resolved: 'Solved',
};

export type FaqId = 'stuck' | 'unlink' | 'pin' | 'limits';

/**
 * Quick answers. The prototype's words, corrected where the app differs:
 * "Your limits" lives on the Palm tab, and the figures are the tier's real
 * caps.
 */
export const FAQ: { id: FaqId; label: string; title: string; body: string }[] = [
  {
    id: 'stuck',
    label: 'Stuck payment',
    title: 'Stuck payment',
    body: 'Most payments finish within a minute. If one stays "In progress", we keep checking with the provider. If it fails, you get a full refund automatically.',
  },
  {
    id: 'unlink',
    label: 'Unlink bank',
    title: 'Unlink a bank',
    body: 'Go to Me › Linked banks and tap the trash icon next to the account. You need at least one linked account to pay.',
  },
  {
    id: 'pin',
    label: 'Biometrics / PIN',
    title: 'Biometrics and PIN',
    body: 'Change your PIN in Me › Change PIN. Turn fingerprint unlock on or off under Me › Security.',
  },
  {
    id: 'limits',
    label: 'Daily limits',
    title: 'Daily limits',
    body: 'See your tier in Me › Account limits, and lower your own limits under Your limits on the Palm tab. Tier 2 allows up to ₦150,000 per payment and ₦500,000 a day.',
  },
];

/** "Just now" · "12m ago" · "2h ago" · "Yesterday" · "Sep 22". */
export function agoLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()) return 'Yesterday';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** A bubble's time: "7:52 AM". */
export function bubbleTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "3 chats" · "1 chat". */
export function chatCount(n: number): string {
  return `${n} ${n === 1 ? 'chat' : 'chats'}`;
}

export interface MessageLike {
  sender_type: string;
  content: string;
  created_at: string;
}

/** The card's preview: the last thing a person said, never a system notice. */
export function lastSaid(messages: MessageLike[], fallback: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_type !== 'system') return messages[i].content;
  }
  return fallback || 'New conversation';
}

/** How long "Agent is typing" stays after the last signal from the portal. */
export const TYPING_HOLD_MS = 4000;
