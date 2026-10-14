import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowUpCircle, ArrowUpRight, Check, RotateCcw, Send, UserCheck, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { TransactionDrawer } from "@milipay/shared/components/transactions/TransactionDrawer";
import { TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { usePerson } from "@milipay/shared/components/support/Customer360";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { DeskProvider, useDesk } from "@milipay/shared/features/support/DeskContext";
import {
  URGENCY_TONE,
  ago,
  fetchThread,
  firstNameOf,
  markSeen,
  postToTicket,
  ticketAction,
  type DeskTicket,
  type ThreadLine,
} from "@milipay/shared/features/support/desk";
import { ROUTES } from "@milipay/shared/lib/constants";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { formatNairaWhole, initials } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Support (design handoff, MiliPay Admin "support"): the same tickets
 * and conversations as the support portal, for oversight: filter by state,
 * assign to yourself, escalate, solve or reopen, reply or leave an internal
 * note, and jump to the customer or their latest payment.
 */

type Filter = "open" | "in_progress" | "escalated" | "resolved" | "all";

const FILTERS: [Filter, string][] = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["escalated", "Escalated"],
  ["resolved", "Solved"],
  ["all", "All"],
];

export function matchesFilter(t: DeskTicket, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "escalated") return t.escalated && t.status !== "resolved";
  return t.status === f;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AdminSupportPage() {
  return (
    <DeskProvider trackPresence={false}>
      <AdminDesk />
    </DeskProvider>
  );
}

function AdminDesk() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { inbox, error } = useDesk();
  const [filter, setFilter] = useState<Filter>("open");
  const tickets = useMemo(() => inbox?.tickets ?? [], [inbox]);
  const list = useMemo(
    () => tickets.filter((t) => matchesFilter(t, filter)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [tickets, filter],
  );
  const current = routeId ? tickets.find((t) => t.id === routeId) ?? null : list[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 animate-fade-in lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_260px]">
      <div className={clsx("flex min-h-0 flex-col border-r border-line bg-panel", routeId && "hidden lg:flex")}>
        <div className="px-[18px] pb-3 pt-[18px]">
          <div className="text-xl font-bold tracking-[-.02em]">Support</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map(([id, label]) => {
              const on = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={clsx(
                    "flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium",
                    on ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted",
                  )}
                >
                  {label}
                  <span className="font-bold">{tickets.filter((t) => matchesFilter(t, id)).length}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-line">
          {!inbox && !error && <div className="p-[18px] text-[13px] text-muted">Loading…</div>}
          {error && <div className="m-3 rounded-[10px] bg-fail-soft p-3 text-[13px] text-fail">{error}</div>}
          {inbox && list.length === 0 && <div className="p-[18px] text-[13px] text-muted">No tickets here.</div>}
          {list.map((t) => {
            const on = current?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(ROUTES.supportDetails.replace(":id", t.id), { replace: true })}
                className={clsx(
                  "block w-full border-b border-l-[3px] border-b-line2 px-[18px] py-3 text-left hover:bg-hover",
                  on ? "border-l-brand bg-hover" : "border-l-transparent",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11.5px] text-muted">{t.ticketId}</span>
                  <span className={clsx("rounded-[5px] px-[7px] py-px text-[11px] font-semibold", TONE_CLASSES[URGENCY_TONE[t.urgency]])}>{cap(t.urgency)}</span>
                  {t.escalated && t.status !== "resolved" && (
                    <span className="rounded-[5px] bg-info-soft px-[7px] py-px text-[11px] font-semibold text-info">Escalated</span>
                  )}
                  <span className="ml-auto text-xs text-faint">{ago(t.createdAt)}</span>
                </span>
                <span className="mt-[5px] block truncate font-semibold">{t.subject}</span>
                <span className="mt-[3px] flex justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{t.customer}</span>
                  <span className="flex-none">{t.assigneeName || "Unassigned"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {current ? (
        <AdminTicket key={current.id} ticket={current} />
      ) : (
        <div className="hidden min-h-0 items-center justify-center bg-canvas text-[13px] text-muted lg:flex xl:col-span-2">
          {!inbox ? "" : routeId ? "This ticket isn't in the list. Solved tickets older than 7 days drop off." : "Pick a ticket."}
        </div>
      )}
    </div>
  );
}

function AdminTicket({ ticket }: { ticket: DeskTicket }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { flash } = useToast();
  const { reload, messageTick } = useDesk();
  const person = usePerson(ticket.customerId, null);
  const [lines, setLines] = useState<ThreadLine[] | null>(null);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [txKey, setTxKey] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const solved = ticket.status === "resolved";
  const internal = mode === "note";

  const loadThread = useCallback(async () => {
    setLines(await fetchThread(ticket.id).catch(() => []));
  }, [ticket.id]);

  useEffect(() => {
    void loadThread();
  }, [loadThread, messageTick]);

  useEffect(() => {
    if (ticket.unread) void markSeen(ticket.id).catch(() => undefined);
  }, [ticket.id, ticket.unread]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines?.length]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      flash(done);
      await Promise.all([reload(), loadThread()]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "That didn't work. Try again.", "fail");
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || (!internal && solved)) return;
    void act(async () => {
      await postToTicket(ticket.id, mode, text);
      setDraft("");
    }, internal ? "Note added" : "Reply sent");
  };

  const actions: { label: string; icon: LucideIcon; primary?: boolean; go: () => void }[] = [
    ...(!ticket.assignedTo && !solved
      ? [{ label: "Assign to me", icon: UserCheck, go: () => void act(() => ticketAction(ticket.id, "take"), `${ticket.ticketId ?? "Ticket"} assigned to you`) }]
      : []),
    ...(!ticket.escalated && !solved
      ? [{ label: "Escalate", icon: ArrowUpCircle, go: () => void act(() => ticketAction(ticket.id, "escalate"), "Escalated to the admin team") }]
      : []),
    ...(!solved
      ? [{ label: "Mark solved", icon: Check, primary: true, go: () => void act(() => ticketAction(ticket.id, "solve"), "Ticket marked as solved") }]
      : [{ label: "Reopen", icon: RotateCcw, go: () => void act(() => ticketAction(ticket.id, "reopen"), "Ticket reopened") }]),
  ];

  // The payment most likely in question: the latest that didn't simply go through.
  const tx = person.payments.find((p) => p.status !== "delivered") ?? person.payments[0] ?? null;
  const txStatus = tx ? presentTransactionStatus(tx.status) : null;
  const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Solved" }[ticket.status];
  const tierLabel = person.detail ? (person.detail.tier === 1 ? "Tier 1" : `Tier ${person.detail.tier ?? 2}`) : ticket.signupId ? "Signing up" : "—";

  return (
    <>
      <div className="flex min-h-0 flex-col bg-canvas">
        <div className="flex flex-col gap-2.5 border-b border-line bg-panel px-[22px] py-3.5">
          <div className="min-w-0">
            <div className="truncate text-base font-bold">{ticket.subject}</div>
            <div className="mt-0.5 truncate text-xs text-muted">
              <span className="font-mono">{ticket.ticketId}</span> · opened {ago(ticket.createdAt)} ago · {statusLabel}
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
                  "flex h-[34px] items-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-semibold disabled:opacity-60",
                  a.primary ? "border-brand bg-brand text-brand-ink" : "border-line bg-panel text-fg hover:bg-hover",
                )}
              >
                <a.icon size={14} aria-hidden="true" />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto p-[22px]">
          {(lines ?? []).map((l) => {
            if (l.type === "system" || l.type === "event") {
              return (
                <div key={l.id} className="self-center rounded-full bg-chip px-2.5 py-1 text-xs text-faint">
                  {l.text}
                </div>
              );
            }
            const staff = l.type !== "customer";
            const note = l.type === "note";
            const call = l.type === "call";
            const who = l.type === "customer" ? ticket.customer : note ? `${l.who ?? "Staff"} · internal note` : call ? `${l.who ?? "Staff"} · call` : l.who ?? "Support";
            return (
              <div key={l.id} className={clsx("flex flex-col", staff ? "items-end" : "items-start")}>
                <div className={clsx("flex max-w-[70%] flex-col gap-1", staff ? "items-end" : "items-start")}>
                  <div className="text-xs text-muted">
                    {who} · {ago(l.at)} ago
                  </div>
                  <div
                    className={clsx(
                      "whitespace-pre-wrap rounded-[14px] border px-3.5 py-2.5 leading-normal",
                      note
                        ? "border-dashed border-warn bg-warn-soft text-fg"
                        : call
                          ? "border-info bg-info-soft text-fg"
                          : staff
                            ? "border-brand bg-brand text-brand-ink"
                            : "border-line bg-panel text-fg",
                    )}
                  >
                    {l.text}
                  </div>
                </div>
              </div>
            );
          })}
          {lines && lines.length === 0 && (
            <div className="flex max-w-[70%] flex-col gap-1">
              <div className="text-xs text-muted">{ticket.customer}</div>
              <div className="rounded-[14px] border border-line bg-panel px-3.5 py-2.5 leading-normal">{ticket.description}</div>
            </div>
          )}
        </div>

        <div className="border-t border-line bg-panel px-[22px] pb-[18px] pt-3.5">
          <div className="mb-2.5 flex gap-1.5">
            {(
              [
                ["reply", "Reply to customer"],
                ["note", "Internal note"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={clsx(
                  "rounded-[7px] px-2.5 py-[5px] text-[12.5px] font-semibold",
                  mode === id ? (id === "note" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-text") : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              disabled={!internal && solved}
              placeholder={internal ? "Only staff can see this…" : solved ? "This ticket is solved. Reopen it to reply." : `Reply to ${firstNameOf(ticket.customer)}…`}
              aria-label="Message"
              className={clsx(
                "flex-1 resize-none rounded-xl border px-3 py-2.5 leading-[1.45] text-fg outline-none placeholder:text-faint disabled:opacity-60",
                internal ? "border-warn bg-warn-soft" : "border-line bg-field focus:border-brand",
              )}
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || busy || (!internal && solved)}
              className="flex h-[42px] items-center gap-2 rounded-xl bg-brand px-4 font-bold text-brand-ink disabled:opacity-45"
            >
              <Send size={15} aria-hidden="true" />
              {internal ? "Add note" : "Send"}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-[18px] xl:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-soft font-bold text-brand-text">{initials(ticket.customer)}</div>
          <div className="min-w-0">
            <div className="truncate font-bold">{ticket.customer}</div>
            <div className="font-mono text-xs text-muted">{ticket.phone}</div>
          </div>
        </div>
        {ticket.customerId && (
          <button
            type="button"
            onClick={() => navigate(ROUTES.customerDetails.replace(":id", ticket.customerId!))}
            className="flex h-[34px] items-center justify-center gap-1.5 rounded-[9px] border border-line text-[13px] font-semibold hover:bg-hover"
          >
            Open customer
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between">
            <div className="text-muted">Tier</div>
            <div className="font-semibold">{tierLabel}</div>
          </div>
          <div className="flex justify-between">
            <div className="text-muted">Urgency</div>
            <div className={clsx("font-semibold", { fail: "text-fail", warn: "text-warn", info: "text-info", muted: "text-muted", ok: "text-brand-text" }[URGENCY_TONE[ticket.urgency]])}>
              {cap(ticket.urgency)}
            </div>
          </div>
          <div className="flex justify-between">
            <div className="text-muted">Assigned to</div>
            <div className="font-semibold">{ticket.assignedTo === user?.id ? "You" : ticket.assigneeName || "Unassigned"}</div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">Related payment</div>
          {tx && txStatus ? (
            <button type="button" onClick={() => setTxKey(tx.id)} className="w-full rounded-xl border border-line p-3 text-left hover:border-brand">
              <span className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs">{tx.reference}</span>
                <span className="font-bold tabular-nums">{formatNairaWhole(tx.amount)}</span>
              </span>
              <span className={clsx("mt-1 block text-xs font-semibold", { fail: "text-fail", warn: "text-warn", info: "text-info", muted: "text-muted", ok: "text-brand-text" }[txStatus.tone])}>
                {txStatus.label}
              </span>
            </button>
          ) : (
            <div className="text-[13px] text-muted">{person.loading ? "Loading…" : "No payments."}</div>
          )}
        </div>
      </div>

      <TransactionDrawer txKey={txKey} onClose={() => setTxKey(null)} onChanged={person.reload} />
    </>
  );
}

export default AdminSupportPage;
