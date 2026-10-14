import { supabase } from "@milipay/shared/lib/supabase";
import type { Tone } from "@milipay/shared/components/ui/StatusBadge";

/**
 * The complaints desk (design handoff, MiliPay Support): the queue, one
 * conversation, the people asking, and what support can do about it. Every
 * read and write goes through the support_* RPCs; account help (SMS, codes,
 * fraud reports) goes through the support-desk Edge Function.
 */

export type Urgency = "critical" | "high" | "medium" | "low";
export type Channel = "chat" | "call" | "email" | "walk_in";
export type DeskStatus = "open" | "in_progress" | "resolved";
export type Presence = "online" | "away" | "offline";

export interface DeskTicket {
  id: string;
  ticketId: string | null;
  subject: string;
  description: string;
  channel: Channel;
  urgency: Urgency;
  status: DeskStatus;
  escalated: boolean;
  assignedTo: string | null;
  assigneeName: string | null;
  customerId: string | null;
  customer: string;
  phone: string | null;
  signupId: string | null;
  createdAt: string;
  updatedAt: string;
  firstRepliedAt: string | null;
  resolvedAt: string | null;
  unread: number;
}

export interface DeskAgent {
  id: string;
  name: string;
  role: string;
  presence: Presence;
  open: number;
}

export interface DeskInbox {
  me: { id: string; name: string; role: string; presence: Presence } | null;
  agents: DeskAgent[];
  tickets: DeskTicket[];
}

export type LineType = "customer" | "staff" | "system" | "note" | "call" | "event";

export interface ThreadLine {
  id: string;
  type: LineType;
  text: string;
  at: string;
  who: string | null;
  senderId: string | null;
  meta: { direction?: "in" | "out" | "missed"; minutes?: number | null; outcome?: string } | null;
}

// ── SLA (handoff "Behaviour rules": first reply / resolve, in minutes) ────
export const SLA: Record<Urgency, [number, number]> = {
  critical: [5, 60],
  high: [15, 240],
  medium: [60, 480],
  low: [240, 1440],
};

export interface SlaState {
  tone: Tone;
  /** Minutes left; negative when overdue. */
  left: number;
  first: boolean;
  label: string;
  text: string;
  pct: number;
  policy: string;
}

function clock(minutes: number): string {
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = Math.floor(a % 60);
  const s = Math.floor((a * 60) % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The SLA clock, as the design draws it: the first-reply limit until someone
 * answers, then the resolve limit, both from when the ticket was opened.
 * ok → warn in the last 25% → fail when overdue; solved tickets are muted.
 */
export function slaOf(t: Pick<DeskTicket, "urgency" | "status" | "createdAt" | "firstRepliedAt">, now = Date.now()): SlaState {
  const [fr, rs] = SLA[t.urgency] ?? SLA.medium;
  const elapsed = (now - Date.parse(t.createdAt)) / 60000;
  const first = !t.firstRepliedAt;
  const limit = first ? fr : rs;
  const left = limit - elapsed;
  const solved = t.status === "resolved";
  const tone: Tone = solved ? "muted" : left < 0 ? "fail" : left < limit * 0.25 ? "warn" : "ok";
  return {
    tone,
    left,
    first,
    label: solved ? "Solved" : left < 0 ? `-${clock(left)}` : clock(left),
    text: solved
      ? "Solved"
      : left < 0
        ? `${first ? "First reply" : "Resolution"} overdue by ${clock(left)}`
        : `${first ? "First reply" : "Resolve"} due in ${clock(left)}`,
    pct: Math.max(0, Math.min(100, (1 - left / limit) * 100)),
    policy: `${cap(t.urgency)} · reply ${fr}m · resolve ${rs >= 60 ? `${rs / 60}h` : `${rs}m`}`,
  };
}

export const URGENCY_TONE: Record<Urgency, Tone> = { critical: "fail", high: "warn", medium: "info", low: "muted" };

export const CHANNEL_LABEL: Record<Channel, string> = {
  chat: "In-app chat",
  call: "Phone call",
  email: "Email",
  walk_in: "Walk-in",
};

/** "3m", "2h", "4d": the queue's age column. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const m = (now - Date.parse(iso)) / 60000;
  if (m < 1) return "now";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

export function firstNameOf(name: string | null | undefined): string {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

/**
 * A saved reply with the ticket filled in. {first}, {amount} and {bank} come
 * from the customer; a placeholder with nothing to fill stays for the agent.
 */
export function fillReply(body: string, fill: { first?: string | null; amount?: string | null; bank?: string | null }): string {
  return body
    .replace(/\{first\}/g, fill.first || "{first}")
    .replace(/\{amount\}/g, fill.amount || "{amount}")
    .replace(/\{bank\}/g, fill.bank || "{bank}");
}

/** A short, readable reference for a sign-up (its id is a uuid). Same as the server's. */
export function signupRef(id: string): string {
  return `SUP-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

// ── Reads ─────────────────────────────────────────────────────────────────
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchInbox = () => rpc<DeskInbox>("support_inbox");
export const fetchThread = (id: string) => rpc<ThreadLine[]>("support_ticket_thread", { p_id: id });
export const markSeen = (id: string) => rpc<void>("support_mark_seen", { p_id: id });

export interface Person {
  kind: "customer" | "applicant";
  id: string;
  name: string;
  phone: string | null;
  tier: number | null;
  palm: boolean;
  status: string | null;
  signupStep: number | null;
  match: string | null;
  openTickets: number;
  lastContact: string | null;
}
export const searchPeople = (q: string) => rpc<Person[]>("support_people", { p_q: q });

export type ApplicantStatus = "review" | "blocked" | "in_progress" | "abandoned" | "rejected" | "agent" | "approved" | "completed";

export interface Applicant {
  id: string;
  name: string | null;
  phone: string;
  step: string;
  stepNumber: number;
  status: ApplicantStatus;
  reason: string | null;
  selfieFailure: string | null;
  attempts: number;
  smileStatus: string | null;
  smileConfidence: number | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  phoneVerified: boolean;
  priorityAt: string | null;
  ninBlockedAt: string | null;
  blockedCustomer: { id: string; state: string | null; registeredBy: string | null } | null;
  fraudCase: string | null;
  customerId: string | null;
  tickets: { id: string; ticketId: string | null; channel: Channel; subject: string; status: DeskStatus; createdAt: string; updatedAt: string }[];
}
export const fetchApplicant = (id: string) => rpc<Applicant | null>("support_applicant", { p_id: id });

export interface DeskPayment {
  id: string;
  reference: string;
  amount: number;
  status: string;
  createdAt: string;
  palm: boolean;
  serviceType: string | null;
  provider: string | null;
  merchantName: string | null;
  failureReason: string | null;
  bank: string | null;
  bankLast4: string | null;
  refundable: boolean;
  refundRequested: boolean;
}
export const fetchPayments = (customerId: string) =>
  rpc<{ spentToday: number; payments: DeskPayment[] }>("support_customer_payments", { p_id: customerId });

export interface SupportToday {
  solvedToday: number;
  solvedTodayMine: number;
  solvers: number;
  firstReplySeconds: number | null;
  firstReplyCount: number;
  slow: { provider: string; service: string | null; pending: number; oldestMinutes: number }[];
}
export const fetchToday = () => rpc<SupportToday>("support_today");

export interface CallRow {
  id: string;
  at: string;
  summary: string;
  direction: "in" | "out" | "missed" | null;
  minutes: number | null;
  outcome: string | null;
  ticketUuid: string;
  ticketId: string | null;
  customer: string;
  agent: string | null;
}
export const fetchCalls = () => rpc<CallRow[]>("support_calls", { p_limit: 200 });

export interface SavedReply {
  id: string;
  title: string;
  tag: string;
  body: string;
  uses: number;
}
export const fetchReplies = () => rpc<SavedReply[]>("support_saved_replies");
export const recordReplyUse = (id: string, ticketId?: string | null) =>
  rpc<void>("support_use_reply", { p_id: id, p_ticket: ticketId ?? null }).catch(() => undefined);

// ── Writes ────────────────────────────────────────────────────────────────
export const ticketAction = (id: string, action: "take" | "solve" | "reopen" | "escalate") =>
  rpc<{ success: boolean }>("support_ticket_action", { p_id: id, p_action: action });

export type CallMeta = { direction: "in" | "out" | "missed"; minutes: number | null; outcome: string };
export const postToTicket = (id: string, kind: "reply" | "note" | "call", text: string, meta?: CallMeta) =>
  rpc<string>("support_post", { p_id: id, p_kind: kind, p_text: text, p_meta: meta ?? null });

export const handOver = (id: string, to: string, note: string) =>
  rpc<{ success: boolean; to: string }>("support_handover", { p_id: id, p_to: to, p_note: note });

export const requestRefund = (ticketId: string, reference: string, reason: string) =>
  rpc<{ success: boolean }>("support_request_refund", { p_ticket: ticketId, p_reference: reference, p_reason: reason });

export const createDeskTicket = (args: {
  customerId?: string | null;
  signupId?: string | null;
  channel: "call" | "email";
  subject: string;
  urgency: Urgency;
  note: string;
}) =>
  rpc<string>("support_create_ticket", {
    p_customer_id: args.customerId ?? null,
    p_signup_id: args.signupId ?? null,
    p_channel: args.channel,
    p_subject: args.subject,
    p_urgency: args.urgency,
    p_note: args.note,
  });

export const setPresence = (status: Presence) => rpc<Presence>("support_set_presence", { p_status: status });

export type HelpAction = "reset_link" | "login_code" | "nearest_agents" | "signup_priority" | "nin_misuse" | "signup_code";

async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // not JSON
    }
  }
  return fallback;
}

/** Account help from the customer panel; throws the server's message. */
export async function accountHelp(args: {
  action: HelpAction;
  ticketId?: string | null;
  customerId?: string | null;
  signupId?: string | null;
  note: string;
}): Promise<{ caseNumber: string | null }> {
  const { data, error } = await supabase.functions.invoke("support-desk", {
    body: {
      action: args.action,
      ticketId: args.ticketId ?? undefined,
      customerId: args.customerId ?? undefined,
      signupId: args.signupId ?? undefined,
      note: args.note,
    },
  });
  if (error) throw new Error(await functionError(error, "That didn't work. Try again."));
  if (!data?.success) throw new Error(data?.error || "That didn't work. Try again.");
  return { caseNumber: data.caseNumber ?? null };
}

// ── Admins: refund requests (Operations) ──────────────────────────────────
export interface RefundRequest {
  id: string;
  reference: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "declined";
  pending: boolean;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  txStatus: string;
  merchantName: string | null;
  serviceType: string | null;
  ticketUuid: string | null;
  ticketId: string | null;
  customer: string;
}
export const fetchRefundRequests = () => rpc<RefundRequest[]>("admin_refund_requests");
export const decideRefundRequest = (id: string, approve: boolean, note: string) =>
  rpc<{ success: boolean }>("admin_decide_refund_request", { p_id: id, p_approve: approve, p_note: note });
