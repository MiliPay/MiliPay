import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpCircle,
  Check,
  CornerUpLeft,
  Hand,
  Inbox,
  Info,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Repeat,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Store,
  Timer,
  Undo2,
  UserCheck,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Customer360, usePerson } from "@milipay/shared/components/support/Customer360";
import { ReasonDialog } from "@milipay/shared/components/ui/ReasonDialog";
import { TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { useClock, useDesk } from "@milipay/shared/features/support/DeskContext";
import {
  CHANNEL_LABEL,
  URGENCY_TONE,
  ago,
  fetchReplies,
  fetchThread,
  fillReply,
  firstNameOf,
  handOver,
  markSeen,
  postToTicket,
  recordReplyUse,
  requestRefund,
  slaOf,
  ticketAction,
  type CallMeta,
  type Channel,
  type DeskTicket,
  type SavedReply,
  type ThreadLine,
} from "@milipay/shared/features/support/desk";
import { supabase } from "@milipay/shared/lib/supabase";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";
import { formatNairaWhole, initials } from "@milipay/shared/lib/utils/format";

/**
 * Support › Complaints desk (design handoff, MiliPay Support "inbox"): the
 * queue on the left with live SLA timers, the conversation in the middle with
 * a composer for replies, internal notes and logged calls, and the customer
 * panel on the right. /complaints/:id opens one ticket (deep links, and the
 * dashboard's "Closest to breaching").
 */

type QueueTab = "mine" | "unassigned" | "open" | "solved";
type Mode = "reply" | "note" | "call";

export const CHANNEL_ICON: Record<Channel, LucideIcon> = { chat: MessageCircle, call: Phone, email: Mail, walk_in: Store };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The tabs' lists, as the design defines them. */
export function queueLists(tickets: DeskTicket[], me: string | undefined): Record<QueueTab, DeskTicket[]> {
  const open = tickets.filter((t) => t.status !== "resolved");
  return {
    mine: open.filter((t) => t.assignedTo === me),
    unassigned: open.filter((t) => !t.assignedTo),
    open,
    solved: tickets.filter((t) => t.status === "resolved"),
  };
}

/** The icon for a centred system or staff-only line, from what it says. */
function lineIcon(text: string): LucideIcon {
  if (/joined|took this/i.test(text)) return UserCheck;
  if (/^solved/i.test(text)) return Check;
  if (/refund/i.test(text)) return Undo2;
  if (/handed over/i.test(text)) return Repeat;
  if (/reopened/i.test(text)) return RotateCcw;
  if (/escalat/i.test(text)) return ArrowUpCircle;
  if (/password|code/i.test(text)) return KeyRound;
  if (/agents/i.test(text)) return MapPin;
  if (/fraud|prioritise/i.test(text)) return ShieldAlert;
  if (/flagged|duplicate/i.test(text)) return AlertTriangle;
  return Info;
}

const CALL_OUTCOMES = ["Resolved", "Needs follow-up", "Escalated", "No answer", "Missed"];

export function ComplaintsDesk() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { inbox, error, reload, messageTick } = useDesk();
  const now = useClock(1000);

  const [tab, setTab] = useState<QueueTab>("mine");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"sla" | "new">("sla");
  const [seen, setSeen] = useState<Record<string, true>>({});

  const tickets = inbox?.tickets ?? [];
  const me = user?.id;
  const lists = useMemo(() => queueLists(tickets, me), [tickets, me]);

  // Arriving on /complaints with nothing of your own: show what's new.
  const settled = useRef(false);
  useEffect(() => {
    if (!inbox || settled.current) return;
    settled.current = true;
    const target = routeId ? tickets.find((t) => t.id === routeId) : null;
    if (target) setTab(target.status === "resolved" ? "solved" : target.assignedTo === me ? "mine" : "open");
    else if (lists.mine.length === 0 && lists.unassigned.length > 0) setTab("unassigned");
  }, [inbox, routeId, tickets, me, lists]);

  const term = q.trim().toLowerCase();
  const list = useMemo(() => {
    const rows = lists[tab].filter((t) => !term || `${t.customer} ${t.subject} ${t.ticketId ?? ""}`.toLowerCase().includes(term));
    return [...rows].sort((a, b) =>
      sort === "sla" ? slaOf(a, now).left - slaOf(b, now).left : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    // The SLA order only needs refreshing with the queue, not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, tab, term, sort]);

  // A deep link waits for its ticket (just created, or older than the queue holds).
  const current = routeId ? tickets.find((t) => t.id === routeId) ?? null : list[0] ?? null;

  const select = (t: DeskTicket) => navigate(SUPPORT_ROUTES.complaintDetails.replace(":id", t.id), { replace: true });

  useEffect(() => {
    if (!current || seen[current.id]) return;
    setSeen((s) => ({ ...s, [current.id]: true }));
    if (current.unread) void markSeen(current.id).catch(() => undefined);
  }, [current, seen]);

  const tabs: [QueueTab, string][] = [
    ["mine", "Mine"],
    ["unassigned", "New"],
    ["open", "Open"],
    ["solved", "Solved"],
  ];

  return (
    <div
      className={clsx(
        "grid h-full min-h-0 grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_300px]",
      )}
    >
      {/* ── Queue ───────────────────────────────────────────────────────── */}
      <div className={clsx("flex min-h-0 flex-col border-r border-line bg-panel", routeId && "hidden lg:flex")}>
        <div className="flex overflow-x-auto border-b border-line px-2 pt-2.5 [scrollbar-width:none]" role="tablist">
          {tabs.map(([id, label]) => {
            const on = tab === id;
            const count = lists[id].length;
            const hot = id === "unassigned" && count > 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className={clsx(
                  "-mb-px flex flex-none items-center gap-[5px] whitespace-nowrap border-b-2 px-[5px] pb-2.5 pt-2 text-[13px]",
                  on ? "border-brand font-bold text-fg" : "border-transparent font-medium text-muted",
                )}
              >
                {label}
                <span className={clsx("rounded-full px-[5px] text-[11px] font-bold", hot ? "bg-fail-soft text-fail" : "bg-chip text-muted")}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-b border-line2 px-3 py-2.5">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-field px-2.5 text-faint">
            <Search size={14} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tickets"
              aria-label="Search tickets"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "sla" ? "new" : "sla")}
            title={sort === "sla" ? "Sorted by SLA, soonest first" : "Sorted by newest"}
            className="flex h-8 flex-none items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2 text-xs font-semibold text-muted hover:bg-hover"
          >
            <ArrowDownUp size={13} aria-hidden="true" />
            {sort === "sla" ? "SLA" : "New"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!inbox && !error && <div className="p-5 text-[13px] text-muted">Loading the queue…</div>}
          {error && <div className="m-3 rounded-[10px] bg-fail-soft p-3 text-[13px] text-fail">{error}</div>}
          {inbox && list.length === 0 && (
            <div className="px-5 py-10 text-center text-[13px] text-muted">
              <div className="mb-2 flex justify-center text-brand">
                <Inbox size={26} aria-hidden="true" />
              </div>
              Nothing here. Nice work.
            </div>
          )}
          {list.map((t) => {
            const s = slaOf(t, now);
            const on = current?.id === t.id;
            const unread = on || seen[t.id] ? 0 : t.unread;
            const Icon = CHANNEL_ICON[t.channel] ?? MessageCircle;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t)}
                className={clsx(
                  "flex w-full gap-2.5 border-b border-l-[3px] border-b-line2 px-3.5 py-3 text-left hover:bg-hover",
                  on ? "border-l-brand bg-hover" : "border-l-transparent",
                )}
              >
                <span className="relative flex-none">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip text-xs font-bold text-muted">{initials(t.customer)}</span>
                  <span className="absolute -bottom-[3px] -right-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-panel text-muted">
                    <Icon size={11} aria-hidden="true" />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="flex items-center gap-1.5">
                    <span className={clsx("flex-1 truncate", unread ? "font-bold" : "font-semibold")}>{t.customer}</span>
                    <span className="flex-none text-[11.5px] text-faint">{ago(t.createdAt, now)}</span>
                  </span>
                  <span className={clsx("truncate text-[13px]", unread ? "text-fg" : "text-muted")}>{t.subject}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-md px-[7px] py-px text-[11px] font-bold tabular-nums",
                        TONE_CLASSES[s.tone],
                        s.tone === "fail" && "animate-pulse-red",
                      )}
                    >
                      <Timer size={11} aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className={clsx("rounded-md px-[7px] py-px text-[11px] font-semibold", TONE_CLASSES[URGENCY_TONE[t.urgency]])}>{cap(t.urgency)}</span>
                    <span className="flex-1" />
                    {unread > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-brand px-[5px] text-[10.5px] font-extrabold text-brand-ink">
                        {unread}
                      </span>
                    )}
                    {t.assignedTo && t.assignedTo !== me && <span className="text-[11px] text-faint">{firstNameOf(t.assigneeName)}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {current ? (
        <TicketPane key={current.id} ticket={current} now={now} messageTick={messageTick} onChanged={reload} hasRoute={Boolean(routeId)} />
      ) : (
        <div className="hidden min-h-0 items-center justify-center text-[13px] text-muted lg:flex xl:col-span-2">
          {!inbox ? "" : routeId ? "This ticket isn't in the queue. Solved tickets older than 7 days drop off." : "Pick a ticket to see the conversation."}
        </div>
      )}
    </div>
  );
}

// ── One ticket: conversation, composer and the customer panel ─────────────
function TicketPane({
  ticket,
  now,
  messageTick,
  onChanged,
  hasRoute,
}: {
  ticket: DeskTicket;
  now: number;
  messageTick: number;
  onChanged: () => Promise<void>;
  hasRoute: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { flash } = useToast();
  const { inbox } = useDesk();
  const person = usePerson(ticket.customerId, ticket.signupId);
  const [lines, setLines] = useState<ThreadLine[] | null>(null);
  const [mode, setMode] = useState<Mode>("reply");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallMeta>({ direction: ticket.channel === "call" ? "in" : "out", minutes: null, outcome: "Resolved" });
  const [sending, setSending] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [macroQ, setMacroQ] = useState("");
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [modal, setModal] = useState<"handover" | "refund" | null>(null);
  const [refundPick, setRefundPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const first = firstNameOf(ticket.customer);
  const solved = ticket.status === "resolved";
  const mine = ticket.assignedTo === user?.id;

  const loadThread = useCallback(async () => {
    try {
      setLines(await fetchThread(ticket.id));
    } catch {
      setLines((l) => l ?? []);
    }
  }, [ticket.id]);

  useEffect(() => {
    void loadThread();
  }, [loadThread, messageTick]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines?.length]);

  // "Agent is typing…" in the customer's app: a broadcast on the ticket's
  // typing channel, at most every 2 s while replying. Nothing is stored.
  const typing = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTyping = useRef(0);
  useEffect(() => {
    if (ticket.channel !== "chat") return;
    const channel = supabase.channel(`support_typing_${ticket.id}`);
    channel.subscribe();
    typing.current = channel;
    return () => {
      typing.current = null;
      void supabase.removeChannel(channel);
    };
  }, [ticket.id, ticket.channel]);
  const announceTyping = () => {
    const t = Date.now();
    if (!typing.current || t - lastTyping.current < 2000) return;
    lastTyping.current = t;
    void typing.current.send({ type: "broadcast", event: "typing", payload: { from: "staff" } });
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) flash(done);
      await Promise.all([onChanged(), loadThread()]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "That didn't work. Try again.", "fail");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (mode === "reply" && solved) return;
    setSending(true);
    try {
      await postToTicket(ticket.id, mode, text, mode === "call" ? call : undefined);
      setDraft("");
      await Promise.all([loadThread(), onChanged()]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Not sent. Try again.", "fail");
    } finally {
      setSending(false);
    }
  };

  const openMacros = async () => {
    setMacrosOpen((o) => !o);
    setMacroQ("");
    if (!replies) setReplies(await fetchReplies().catch(() => []));
  };

  // {amount} and {bank}: the payment most likely in question, and their bank.
  const focusPay = person.payments.find((p) => p.status !== "delivered") ?? person.payments[0];
  const fill = {
    first,
    amount: focusPay ? formatNairaWhole(focusPay.amount) : null,
    bank: focusPay?.bank ?? person.detail?.accounts[0]?.bank ?? null,
  };
  const mq = macroQ.trim().toLowerCase();
  const macros = (replies ?? []).filter((m) => !mq || `${m.title} ${m.tag} ${m.body}`.toLowerCase().includes(mq));

  const sla = slaOf(ticket, now);
  const openTickets = (inbox?.tickets ?? []).filter(
    (t) => t.status !== "resolved" && ((ticket.customerId && t.customerId === ticket.customerId) || (ticket.signupId && t.signupId === ticket.signupId)),
  ).length;

  type Btn = { label: string; icon: LucideIcon; primary?: boolean; go: () => void };
  const actions: Btn[] = solved
    ? [{ label: "Reopen", icon: RotateCcw, go: () => void act(() => ticketAction(ticket.id, "reopen"), `${ticket.ticketId ?? "Ticket"} reopened`) }]
    : [
        ...(!ticket.assignedTo
          ? [{ label: "Take it", icon: Hand, primary: true, go: () => void act(() => ticketAction(ticket.id, "take"), `${ticket.ticketId ?? "Ticket"} is yours`) }]
          : []),
        { label: "Hand over", icon: Repeat, go: () => setModal("handover") },
        ...(ticket.customerId ? [{ label: "Request refund", icon: Undo2, go: () => (setRefundPick(null), setModal("refund")) }] : []),
        ...(ticket.assignedTo ? [{ label: "Solve", icon: Check, primary: true, go: () => void act(() => ticketAction(ticket.id, "solve"), `${ticket.ticketId ?? "Ticket"} solved`) }] : []),
      ];

  const others = (inbox?.agents ?? []).filter((a) => a.id !== user?.id);
  const refundable = person.payments;
  const preselect = refundPick ? refundable.findIndex((p) => p.reference === refundPick) : -1;

  const hasCustomerLine = (lines ?? []).some((l) => l.type === "customer");
  const ChIcon = CHANNEL_ICON[ticket.channel] ?? MessageCircle;
  const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Solved" }[ticket.status];
  const assigneeLabel = ticket.assignedTo ? (mine ? "Assigned to you" : `Assigned to ${ticket.assigneeName ?? "someone"}`) : "Unassigned";

  const placeholder =
    mode === "note"
      ? "Only your team sees this."
      : mode === "call"
        ? "What was discussed on the call? Outcome and next step."
        : solved
          ? "This ticket is solved. Reopen it to reply."
          : ticket.channel === "chat"
            ? `Reply to ${first}…`
            : `Reply to ${first} in their app…`;

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-col gap-2.5 border-b border-line bg-panel px-5 py-3">
          <div className="flex items-start gap-2">
            {hasRoute && (
              <button
                type="button"
                onClick={() => navigate(SUPPORT_ROUTES.complaints)}
                className="-ml-1 mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg text-muted hover:bg-hover lg:hidden"
                aria-label="Back to the queue"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-bold">{ticket.subject}</div>
              <div className="mt-0.5 flex items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted">
                <span className="font-mono">{ticket.ticketId}</span>
                <span>·</span>
                <ChIcon size={12} aria-hidden="true" />
                <span>{CHANNEL_LABEL[ticket.channel]}</span>
                <span>·</span>
                <span>{statusLabel}</span>
                <span>·</span>
                <span>{assigneeLabel}</span>
                {ticket.escalated && (
                  <>
                    <span>·</span>
                    <span className="text-info">Escalated</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.go}
                disabled={busy}
                className={clsx(
                  "flex h-[34px] items-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-semibold hover:brightness-[.97] disabled:opacity-60",
                  a.primary ? "border-brand bg-brand text-brand-ink" : "border-line bg-panel text-fg",
                )}
              >
                <a.icon size={14} aria-hidden="true" />
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className={clsx("flex items-center gap-1.5 text-[12.5px] font-semibold", toneText(sla.tone))}>
              <Timer size={14} aria-hidden="true" />
              {solved ? "Solved" : sla.text}
            </div>
            <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-chip">
              <div className={clsx("h-full rounded-[3px] transition-[width] duration-1000 ease-linear", toneBg(sla.tone))} style={{ width: `${sla.pct}%` }} />
            </div>
            <div className="hidden text-xs text-faint sm:block">{sla.policy}</div>
          </div>
        </div>

        <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
          {!hasCustomerLine && ticket.description && ticket.channel !== "call" && ticket.channel !== "email" && (
            <Bubble who={ticket.customer} time={`${ago(ticket.createdAt, now)} ago`} text={ticket.description} kind="customer" />
          )}
          {(lines ?? []).map((l) => {
            const time = (now - Date.parse(l.at)) / 60000 < 1 ? "just now" : `${ago(l.at, now)} ago`;
            if (l.type === "system" || l.type === "event") {
              const Icon = lineIcon(l.text);
              return (
                <div
                  key={l.id}
                  title={l.type === "event" ? "Only staff see this" : undefined}
                  className="flex items-center gap-1.5 self-center rounded-full bg-chip px-[11px] py-1 text-xs text-muted"
                >
                  <Icon size={12} aria-hidden="true" />
                  {l.text}
                </div>
              );
            }
            if (l.type === "call") {
              const dir = l.meta?.direction ?? "in";
              const CallIcon = dir === "out" ? PhoneOutgoing : dir === "missed" ? PhoneMissed : PhoneIncoming;
              const parts = [
                dir === "out" ? "Outbound call" : dir === "missed" ? "Missed call" : "Inbound call",
                l.meta?.minutes != null ? `${l.meta.minutes}m` : null,
                l.meta?.outcome,
                l.who,
              ].filter(Boolean);
              return (
                <div key={l.id} className="flex gap-3 self-stretch rounded-[14px] border border-info bg-info-soft px-3.5 py-3">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel text-info">
                    <CallIcon size={16} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{parts.join(" · ")}</div>
                    <div className="mt-[3px] whitespace-pre-wrap text-[13px] leading-[1.45] text-muted">{l.text}</div>
                  </div>
                  <div className="whitespace-nowrap text-xs text-muted">{time}</div>
                </div>
              );
            }
            return (
              <Bubble
                key={l.id}
                kind={l.type === "note" ? "note" : l.type === "staff" ? "staff" : "customer"}
                who={l.type === "customer" ? ticket.customer : l.type === "note" ? `${l.who ?? "Staff"} · internal note` : l.who ?? "Support"}
                time={time}
                text={l.text}
              />
            );
          })}
          {lines && lines.length === 0 && !ticket.description && <div className="self-center text-[13px] text-muted">No messages yet.</div>}
        </div>

        {/* ── Composer ──────────────────────────────────────────────────── */}
        <div className="relative border-t border-line bg-panel px-5 pb-4 pt-3">
          {macrosOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-5 z-[5] flex max-h-[360px] w-[440px] max-w-[calc(100%-40px)] animate-rise-in flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-[0_18px_44px_rgba(0,0,0,.18)]">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-faint">
                <Search size={14} aria-hidden="true" />
                <input
                  autoFocus
                  value={macroQ}
                  onChange={(e) => setMacroQ(e.target.value)}
                  placeholder="Search saved replies"
                  aria-label="Search saved replies"
                  className="flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
                />
                <button type="button" onClick={() => setMacrosOpen(false)} className="flex text-faint" aria-label="Close saved replies">
                  <X size={15} />
                </button>
              </div>
              <div className="overflow-y-auto">
                {replies === null && <div className="p-3.5 text-[13px] text-muted">Loading…</div>}
                {replies && macros.length === 0 && <div className="p-3.5 text-[13px] text-muted">No saved reply matches.</div>}
                {macros.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDraft(fillReply(m.body, fill));
                      setMode("reply");
                      setMacrosOpen(false);
                      void recordReplyUse(m.id, ticket.id);
                    }}
                    className="block w-full border-b border-line2 px-3.5 py-2.5 text-left hover:bg-hover"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 text-[13px] font-semibold">{m.title}</span>
                      <span className="rounded-[5px] bg-chip px-1.5 py-px text-[11px] font-semibold text-muted">{m.tag}</span>
                    </span>
                    <span className="mt-[3px] block truncate text-xs text-muted">{fillReply(m.body, fill)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-2.5 flex items-center gap-1">
            {(
              [
                ["reply", "Reply", CornerUpLeft, "ok"],
                ["note", "Note", Lock, "warn"],
                ["call", "Log call", Phone, "info"],
              ] as const
            ).map(([id, label, Icon, tone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={clsx(
                  "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-[9px] py-1.5 text-[12.5px] font-semibold",
                  mode === id ? TONE_CLASSES[tone] : "text-muted",
                )}
              >
                <Icon size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void openMacros()}
              title="Saved replies"
              className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-[9px] py-1.5 text-[12.5px] font-semibold text-muted hover:bg-hover"
            >
              <Zap size={13} aria-hidden="true" />
              Replies
            </button>
          </div>
          {mode === "call" && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
              <div className="flex gap-0.5 rounded-lg bg-chip p-0.5">
                {(["in", "out", "missed"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCall((c) => ({ ...c, direction: d, outcome: d === "missed" ? "Missed" : c.outcome === "Missed" ? "Resolved" : c.outcome }))}
                    className={clsx("rounded-md px-2 py-1 font-semibold", call.direction === d ? "bg-panel text-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-muted")}
                  >
                    {d === "in" ? "Inbound" : d === "out" ? "Outbound" : "Missed"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-muted">
                Length
                <input
                  inputMode="numeric"
                  value={call.minutes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                    setCall((c) => ({ ...c, minutes: v ? Number(v) : null }));
                  }}
                  placeholder="0"
                  aria-label="Call length in minutes"
                  className="h-7 w-12 rounded-md border border-line bg-field px-2 text-fg outline-none focus:border-brand"
                />
                min
              </label>
              <select
                value={call.outcome}
                onChange={(e) => setCall((c) => ({ ...c, outcome: e.target.value }))}
                aria-label="Call outcome"
                className="h-7 rounded-md border border-line bg-field px-2 text-fg outline-none focus:border-brand"
              >
                {CALL_OUTCOMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2.5">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (mode === "reply" && e.target.value.trim()) announceTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              rows={3}
              placeholder={placeholder}
              disabled={mode === "reply" && solved}
              aria-label="Message"
              className={clsx(
                "flex-1 resize-none rounded-xl border px-3 py-2.5 leading-normal text-fg outline-none placeholder:text-faint disabled:opacity-60",
                mode === "note" ? "border-dashed border-warn bg-warn-soft" : mode === "call" ? "border-info bg-info-soft" : "border-line bg-field focus:border-brand",
              )}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim() || sending || (mode === "reply" && solved)}
              className="flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-brand-ink disabled:opacity-45"
            >
              {mode === "note" ? <Lock size={15} /> : mode === "call" ? <Phone size={15} /> : <Send size={15} />}
              {mode === "note" ? "Add note" : mode === "call" ? "Save call" : "Send"}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden min-h-0 xl:flex xl:flex-col">
        <Customer360
          ticket={ticket}
          person={person}
          openTickets={openTickets}
          onQuote={(text) => {
            setDraft((d) => (d ? `${d}\n${text}` : text));
            setMode("reply");
          }}
          onRefund={(reference) => {
            setRefundPick(reference);
            setModal("refund");
          }}
          onHelped={() => void Promise.all([loadThread(), onChanged()])}
        />
      </div>

      <ReasonDialog
        open={modal === "handover"}
        tone="ok"
        icon={Repeat}
        title="Hand over ticket"
        body={`${ticket.ticketId ?? "This ticket"} moves to the agent you pick, with your note at the top of the thread.`}
        options={others.map((a) => ({
          label: a.name,
          sub: `${cap(a.presence)} · ${a.open} open tickets`,
          right: a.presence === "online" ? "● Online" : a.presence === "away" ? "● Away" : "",
          rightTone: a.presence === "online" ? "ok" : "warn",
          disabled: a.presence === "offline",
        }))}
        noteRequired
        notePlaceholder="Handover note: what you tried, what is left"
        foot="The customer sees no change in the chat."
        confirmLabel="Hand over"
        onClose={() => setModal(null)}
        onConfirm={async (note, _r, picked) => {
          const to = picked != null ? others[picked] : null;
          if (!to) return;
          const res = await handOver(ticket.id, to.id, note);
          setModal(null);
          flash(`${ticket.ticketId ?? "Ticket"} handed to ${res.to}`);
          await Promise.all([onChanged(), loadThread()]);
        }}
      />

      <ReasonDialog
        key={`refund-${refundPick ?? ""}`}
        open={modal === "refund"}
        tone="ok"
        icon={Undo2}
        title="Request a refund"
        body="Support cannot move money. This sends a request to the admin team with the payment and your reason."
        options={refundable.map((p) => ({
          label: `${p.merchantName || [p.provider, p.serviceType].filter(Boolean).join(" ") || "Payment"} · ${formatNairaWhole(p.amount)}`,
          sub: `${p.reference} · ${p.status.replace(/_/g, " ")}`,
          right: p.refundRequested ? "Requested" : p.refundable ? "" : "Not eligible",
          rightTone: "faint",
          disabled: !p.refundable || p.refundRequested,
        }))}
        initialPick={preselect >= 0 ? preselect : null}
        noteRequired
        notePlaceholder="Reason, and what the customer told you"
        foot="The request and the admin decision go on the audit log."
        confirmLabel="Send to admin"
        onClose={() => setModal(null)}
        onConfirm={async (note, _r, picked) => {
          const p = picked != null ? refundable[picked] : null;
          if (!p) return;
          await requestRefund(ticket.id, p.reference, note);
          setModal(null);
          flash("Refund request sent to admin");
          person.reload();
          await Promise.all([onChanged(), loadThread()]);
        }}
      />
    </>
  );
}

function Bubble({ kind, who, time, text }: { kind: "customer" | "staff" | "note"; who: string; time: string; text: string }) {
  const staff = kind !== "customer";
  return (
    <div className={clsx("flex flex-col", staff ? "items-end" : "items-start")}>
      <div className={clsx("flex max-w-[72%] flex-col gap-1", staff ? "items-end" : "items-start")}>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          {kind === "note" && <Lock size={11} aria-hidden="true" />}
          {who} · {time}
        </div>
        <div
          className={clsx(
            "whitespace-pre-wrap rounded-[14px] border px-3.5 py-2.5 leading-normal",
            kind === "note"
              ? "rounded-tr-[4px] border-dashed border-warn bg-warn-soft text-fg"
              : kind === "staff"
                ? "rounded-tr-[4px] border-brand bg-brand text-brand-ink"
                : "rounded-tl-[4px] border-line bg-panel text-fg",
          )}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

function toneText(t: string): string {
  return ({ ok: "text-brand-text", warn: "text-warn", fail: "text-fail", info: "text-info", muted: "text-muted" } as Record<string, string>)[t];
}

function toneBg(t: string): string {
  return ({ ok: "bg-brand-text", warn: "bg-warn", fail: "bg-fail", info: "bg-info", muted: "bg-muted" } as Record<string, string>)[t];
}

export default ComplaintsDesk;
