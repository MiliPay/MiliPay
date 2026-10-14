import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import clsx from "clsx";
import { TONE_CLASSES, type Tone } from "@milipay/shared/components/ui/StatusBadge";
import { useDesk } from "@milipay/shared/features/support/DeskContext";
import { fetchCalls, type CallRow } from "@milipay/shared/features/support/desk";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";

/**
 * Support › Call log (design handoff, MiliPay Support "calls"): every phone
 * call an agent logged from a ticket's composer, newest first. A row opens
 * its ticket.
 */

const COLS = "grid grid-cols-[120px_44px_minmax(0,1.2fr)_90px_150px_minmax(0,1.6fr)_120px] gap-3.5";

const OUTCOME_TONE: Record<string, Tone> = {
  Resolved: "ok",
  "Needs follow-up": "warn",
  Escalated: "info",
  "No answer": "muted",
  Missed: "fail",
};

/** "9:52" today, "Yesterday", or "12 Sep". */
export function callWhen(iso: string, now = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
  const d = new Date(iso);
  if (day(d) === day(now)) {
    return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(d);
  }
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(d);
}

export default function CallLogPage() {
  const navigate = useNavigate();
  const { messageTick } = useDesk();
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCalls().then(
      (r) => {
        setRows(r);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Could not load calls."),
    );
  }, [messageTick]);

  return (
    <div className="flex max-w-[1400px] animate-fade-in flex-col gap-[18px] px-4 py-[26px] sm:px-7">
      <div>
        <div className="text-2xl font-bold tracking-[-.02em]">Call log</div>
        <div className="mt-1 text-muted">Every phone call, linked to its ticket. Log a call from the ticket composer.</div>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>When</div>
              <div />
              <div>Customer</div>
              <div>Length</div>
              <div>Outcome</div>
              <div>Summary</div>
              <div>Agent</div>
            </div>
            {error && <div className="px-5 py-5 text-[13px] text-fail">{error}</div>}
            {!rows && !error && <div className="px-5 py-5 text-[13px] text-muted">Loading…</div>}
            {rows && rows.length === 0 && <div className="px-5 py-5 text-[13px] text-muted">No calls logged yet.</div>}
            {rows?.map((c) => {
              const missed = c.direction === "missed";
              const Icon = c.direction === "out" ? PhoneOutgoing : missed ? PhoneMissed : PhoneIncoming;
              const outcome = c.outcome ?? "Resolved";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(SUPPORT_ROUTES.complaintDetails.replace(":id", c.ticketUuid))}
                  className={clsx(COLS, "h-[54px] w-full items-center border-b border-line2 px-5 text-left hover:bg-hover")}
                >
                  <span className="text-[13px] text-muted">{callWhen(c.at)}</span>
                  <span className={clsx("flex h-[30px] w-[30px] items-center justify-center rounded-[9px]", missed ? TONE_CLASSES.fail : TONE_CLASSES.info)}>
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.customer}</span>
                    <span className="block font-mono text-xs text-muted">{c.ticketId}</span>
                  </span>
                  <span className="tabular-nums text-muted">{c.minutes != null ? `${c.minutes}m` : "—"}</span>
                  <span>
                    <span className={clsx("inline-flex rounded-md px-2 py-[3px] text-xs font-semibold", TONE_CLASSES[OUTCOME_TONE[outcome] ?? "muted"])}>{outcome}</span>
                  </span>
                  <span className="truncate text-[13px] text-muted">{c.summary}</span>
                  <span className="truncate text-[13px]">{c.agent ?? "—"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
