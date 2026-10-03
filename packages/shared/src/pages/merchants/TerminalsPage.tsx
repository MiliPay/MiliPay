import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hand, Power, RotateCcw, Wifi, WifiOff } from "lucide-react";
import clsx from "clsx";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { StatCard } from "@milipay/shared/components/ui/StatCard";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { Tabs } from "@milipay/shared/components/ui/Tabs";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  TERMINAL_STATUS,
  fetchTerminalList,
  heartbeatLabel,
  merchantPath,
  setTerminalActive,
  type TerminalList,
  type TerminalRow,
  type TerminalTab,
} from "@milipay/shared/features/merchants/admin";
import { formatNairaWhole } from "@milipay/shared/lib/utils/format";

/**
 * POS terminals (design handoff, admin "Terminals"): online, offline and
 * deactivated, with a reasoned, audited switch on each. A terminal is
 * offline after 15 minutes without a heartbeat.
 */

const TABS: { id: TerminalTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "inactive", label: "Deactivated" },
];
const COLS = "grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.2fr)_130px_120px_80px_120px_110px] gap-3.5";

export default function TerminalsPage() {
  const navigate = useNavigate();
  const { flash } = useToast();
  const [tab, setTab] = useState<TerminalTab>("all");
  const [data, setData] = useState<TerminalList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Omit<ReasonDialogProps, "open" | "onClose"> | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchTerminalList(tab));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load terminals.");
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (t: TerminalRow) =>
    setDialog({
      title: `${t.active ? "Deactivate" : "Reactivate"} ${t.tid}?`,
      body: t.active
        ? `The terminal at ${t.merchant ?? "this merchant"} stops accepting palm payments right away.`
        : "The terminal can accept payments again once it sends a heartbeat.",
      icon: t.active ? Power : RotateCcw,
      tone: t.active ? "fail" : "ok",
      confirmLabel: t.active ? "Deactivate terminal" : "Reactivate",
      noteRequired: true,
      notePlaceholder: "Reason (required)",
      onConfirm: async (note) => {
        await setTerminalActive(t.id, !t.active, note);
        setDialog(null);
        flash(`${t.tid} ${t.active ? "deactivated" : "reactivated"} · logged`);
        await load();
      },
    });

  const c = data?.counts;
  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-[-.02em]">Terminals</h1>
        <div className="mt-1 text-muted">Palm terminals in the field. A terminal is offline after 15 minutes without a heartbeat.</div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="Online" value={c?.online ?? "—"} icon={<Wifi size={18} />} tone="ok" />
        <StatCard label="Offline" value={c?.offline ?? "—"} icon={<WifiOff size={18} />} tone="fail" />
        <StatCard label="Deactivated" value={c?.inactive ?? "—"} icon={<Power size={18} />} tone="muted" />
        <StatCard label="Payments today" value={data ? data.paymentsToday.toLocaleString("en-NG") : "—"} icon={<Hand size={18} />} tone="info" />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <Tabs<TerminalTab> tabs={TABS.map((t) => ({ ...t, count: c?.[t.id] ?? null }))} value={tab} onChange={setTab} />
        <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Terminal</div>
              <div>Merchant</div>
              <div>Device</div>
              <div>Status</div>
              <div>Last heartbeat</div>
              <div className="text-right">Txns</div>
              <div className="text-right">Volume today</div>
              <div />
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !data && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && data && data.rows.length === 0 && <div className="p-12 text-center text-muted">No terminals here.</div>}
            {data?.rows.map((t) => {
              const [label, tone] = TERMINAL_STATUS[t.state];
              return (
                <div key={t.id} className={clsx(COLS, "h-[52px] items-center border-b border-line2 px-5 hover:bg-hover")}>
                  <div className="font-mono text-[12.5px] font-semibold">{t.tid}</div>
                  <button
                    type="button"
                    onClick={() => navigate(merchantPath("/dashboard/", t.merchantId))}
                    className="truncate text-left font-medium hover:underline"
                  >
                    {t.merchant ?? "—"}
                  </button>
                  <div className="truncate text-[13px] text-muted">
                    {t.model} · <span className="font-mono">{t.serial}</span>
                  </div>
                  <div>
                    <Pill tone={tone} pulse={t.state === "online"}>
                      {label}
                    </Pill>
                  </div>
                  <div className={clsx("text-[13px]", t.state === "offline" ? "text-fail" : "text-muted")}>{heartbeatLabel(t.lastHeartbeat)}</div>
                  <div className="text-right tabular-nums">{t.txnsToday}</div>
                  <div className="text-right font-semibold tabular-nums">{formatNairaWhole(t.volumeToday)}</div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => toggle(t)}
                      className={clsx("flex h-[30px] items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold", t.active ? "text-fail" : "text-brand-text")}
                    >
                      {t.active ? <Power size={13} aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
                      {t.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}
