import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDot, Hand, RefreshCw, Smartphone, Tv, Wifi, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@milipay/shared/lib/supabase";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { RefundRequestsCard } from "@milipay/shared/pages/operations/RefundRequestsCard";
import { TransactionDrawer } from "@milipay/shared/components/transactions/TransactionDrawer";
import { SERVICE, providerName } from "@milipay/shared/features/dashboard/view";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { formatNairaWhole, timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Operations (design handoff): payments the sweep could not settle
 * on its own, oldest first, each one resolved in the transaction drawer; and
 * palm matching health. Built on vtu_operations_snapshot.
 *
 * Every queue here is money sitting with us and somebody has to decide.
 * Without somewhere to see that, the queues fill silently and the first
 * anyone hears is a complaint.
 */

interface Snapshot {
  generatedAt: string;
  queues: {
    pending: number;
    pendingUnresolvable: number;
    refundsOpen: number;
    refundsFailed: number;
    quarantined: number;
    stuck: number;
  };
  attention: {
    reference: string;
    status: string;
    amount: number;
    service_type: string | null;
    provider: string | null;
    failure_reason: string | null;
    updated_at: string;
  }[];
  palm: {
    events: number;
    matched: number;
    ambiguous: number;
    rejected: number;
    avgMargin: number | null;
    minMargin: number | null;
    gallerySize: number | null;
  };
  enrolment: { customers: number; withTemplate: number; simulated: number };
}

interface Sweep {
  lastRunAt: string | null;
  status: string | null;
  everyMinutes: number;
}

const SVC_ICON: Record<string, LucideIcon> = { airtime: Smartphone, data: Wifi, power: Zap, cable: Tv, palm: Hand, other: CircleDot };

/** Why a payment is waiting for a person, in words. */
export function whyItsHere(status: string, failureReason: string | null): string {
  switch (status) {
    case "quarantined":
      return failureReason ? `Held: ${failureReason}` : "Bank confirmation and charge disagree";
    case "refund_failed":
      return failureReason ? `Refund failed: ${failureReason}` : "Refund to the bank failed";
    case "fulfilment_pending":
      return "Provider still says pending";
    case "fulfilling":
      return "No reply from the provider";
    case "refund_pending":
      return "Refund not confirmed by the bank";
    case "initiated":
    case "paid":
      return "Waiting on the bank";
    default:
      return failureReason || "Needs a look";
  }
}

export function OperationsPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      supabase.rpc("vtu_operations_snapshot", { p_hours: 24 }),
      supabase.rpc("admin_sweep_status"),
    ]);
    if (s.error) setError(s.error.message);
    else {
      setSnap(s.data as Snapshot);
      setError(null);
    }
    if (!w.error) setSweep(w.data as Sweep);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const q = snap?.queues;
  const queues: { label: string; value: number; hint: string; tone: "warn" | "info" | "fail" }[] = q
    ? [
        { label: "Delivery pending", value: q.pending, hint: "Provider unresolved", tone: "warn" },
        { label: "Stuck over 1 hour", value: q.stuck, hint: "No progress for an hour", tone: "warn" },
        { label: "Refunds open", value: q.refundsOpen, hint: "Sending to the bank", tone: "info" },
        { label: "Refunds failed", value: q.refundsFailed, hint: "Manual refund needed", tone: "fail" },
        { label: "Held for review", value: q.quarantined, hint: "Needs a decision", tone: "fail" },
      ]
    : [];
  const toneText = { warn: "text-warn", info: "text-info", fail: "text-fail" } as const;
  const toneDot = { warn: "bg-warn", info: "bg-info", fail: "bg-fail" } as const;

  const palm = snap?.palm;
  const en = snap?.enrolment;
  const enrolledPct = en && en.customers > 0 ? (en.withTemplate / en.customers) * 100 : 0;

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Operations</h1>
          <div className="mt-1 text-muted">Payments the sweep could not settle on its own, and palm matching health.</div>
        </div>
        {sweep && (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-[10px] border border-line bg-panel px-3 py-2 text-[13px]",
              sweep.status && sweep.status !== "succeeded" ? "text-warn" : "text-muted",
            )}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {sweep.lastRunAt
              ? `${sweep.status && sweep.status !== "succeeded" ? "Last sweep failed" : "Sweep ran"} ${timeAgo(sweep.lastRunAt)} · runs every ${sweep.everyMinutes} min`
              : "The sweep hasn't run yet"}
          </div>
        )}
      </div>

      {error && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}
      {!snap && !error && <LoadingState title="Loading operations" />}

      {snap && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {queues.map((k) => (
              <div key={k.label} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <div className={clsx("h-2 w-2 rounded-full", toneDot[k.tone])} />
                  {k.label}
                </div>
                <div className={clsx("text-[26px] font-bold tabular-nums", k.value ? toneText[k.tone] : "text-faint")}>{k.value}</div>
                <div className="text-xs text-faint">{k.hint}</div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <div className="flex items-center px-5 pb-3 pt-4">
              <h2 className="flex-1 text-[15px] font-bold">Needs a decision</h2>
              <div className="text-xs text-muted">Oldest first</div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[150px_minmax(260px,2.4fr)_110px_150px_90px_96px] gap-3.5 border-y border-line bg-field px-5 py-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-faint">
                  <div>Reference</div>
                  <div>Why it's here</div>
                  <div className="text-right">Amount</div>
                  <div>Status</div>
                  <div className="text-right">Waiting</div>
                  <div />
                </div>
                {snap.attention.length === 0 && (
                  <div className="p-9 text-center text-muted">
                    <div className="mb-2 flex justify-center text-brand">
                      <CheckCircle2 size={28} aria-hidden="true" />
                    </div>
                    Nothing waiting. The queue is clear.
                  </div>
                )}
                {snap.attention.map((t) => {
                  const svc = t.service_type && SERVICE[t.service_type] ? t.service_type : "other";
                  const s = SERVICE[svc];
                  const Icon = SVC_ICON[svc] ?? CircleDot;
                  const st = presentTransactionStatus(t.status);
                  const waitingMin = (Date.now() - Date.parse(t.updated_at)) / 60000;
                  return (
                    <div
                      key={t.reference}
                      className="grid h-14 grid-cols-[150px_minmax(260px,2.4fr)_110px_150px_90px_96px] items-center gap-3.5 border-b border-line2 px-5 hover:bg-hover"
                    >
                      <div className="truncate font-mono text-[12.5px] font-medium">{t.reference}</div>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={{ background: s.color + "24", color: s.color }}>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold">
                            {providerName(t.provider)} {svc === "other" ? "" : s.label}
                          </div>
                          <div className="truncate text-xs text-muted">{whyItsHere(t.status, t.failure_reason)}</div>
                        </div>
                      </div>
                      <div className="text-right font-semibold tabular-nums">{formatNairaWhole(t.amount)}</div>
                      <div>
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </div>
                      <div className={clsx("text-right text-[13px]", waitingMin > 60 ? "text-fail" : "text-muted")}>
                        {timeAgo(t.updated_at).replace(" ago", "")}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setOpen(t.reference)}
                          className="flex h-[30px] items-center rounded-lg bg-brand px-3 text-xs font-bold text-brand-ink"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <RefundRequestsCard onDecided={() => void load()} />

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-card border border-line bg-panel px-[18px] py-4 shadow-card">
              <div className="flex items-center gap-2">
                <Hand size={16} aria-hidden="true" />
                <h2 className="text-[15px] font-bold">Palm matching · 24h</h2>
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: "Match attempts", value: palm?.events ?? 0, cls: "text-fg" },
                  { label: "Matched", value: palm?.matched ?? 0, cls: "text-brand-text" },
                  { label: "Ambiguous", value: palm?.ambiguous ?? 0, cls: "text-warn" },
                  { label: "Rejected", value: palm?.rejected ?? 0, cls: "text-fail" },
                ].map((p) => (
                  <div key={p.label} className="rounded-xl bg-field p-3">
                    <div className="text-xs text-muted">{p.label}</div>
                    <div className={clsx("mt-0.5 text-[19px] font-bold tabular-nums", p.cls)}>{p.value.toLocaleString("en-NG")}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 flex flex-col gap-2 text-[13px] text-muted">
                <Line label="Average match margin" value={palm?.avgMargin != null ? Number(palm.avgMargin).toFixed(2) : "—"} />
                <Line
                  label="Lowest margin"
                  value={palm?.minMargin != null ? Number(palm.minMargin).toFixed(2) : "—"}
                  cls={palm?.minMargin != null && palm.minMargin < 0.1 ? "text-warn" : undefined}
                />
                <Line label="Gallery size" value={palm?.gallerySize != null ? `${palm.gallerySize.toLocaleString("en-NG")} palms` : "—"} />
              </div>
            </div>
            <div className="rounded-card border border-line bg-panel px-[18px] py-4 shadow-card">
              <h2 className="text-[15px] font-bold">Enrolment</h2>
              <div className="mt-3 flex flex-col gap-2.5 text-[13px]">
                <Line label="Customers" value={(en?.customers ?? 0).toLocaleString("en-NG")} />
                <Line label="With palm template" value={`${(en?.withTemplate ?? 0).toLocaleString("en-NG")} · ${enrolledPct.toFixed(1)}%`} />
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-chip">
                  <div className="h-full bg-brand" style={{ width: `${enrolledPct}%` }} />
                </div>
                <Line label="Simulated captures (test)" value={(en?.simulated ?? 0).toLocaleString("en-NG")} cls={en?.simulated ? "text-warn" : undefined} />
              </div>
            </div>
          </div>
        </>
      )}

      <TransactionDrawer txKey={open} onClose={() => setOpen(null)} onChanged={() => void load()} />
    </div>
  );
}

function Line({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <div className="text-muted">{label}</div>
      <div className={clsx("font-semibold tabular-nums", cls ?? "text-fg")}>{value}</div>
    </div>
  );
}
