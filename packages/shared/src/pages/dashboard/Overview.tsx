import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CircleDot,
  Download,
  Gauge,
  Hand,
  Hourglass,
  Landmark,
  LifeBuoy,
  ScanFace,
  ShieldAlert,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Tv,
  Undo2,
  Unlink,
  UserCheck,
  WifiOff,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { fetchAdminDashboard } from "@milipay/shared/features/dashboard/api";
import {
  RANGES,
  SERVICE,
  conversion,
  delta,
  funnelRows,
  greeting,
  healthRows,
  ledgerTitle,
  sparkHeights,
  tierRows,
  yTicks,
  type DashboardData,
  type DashboardRange,
} from "@milipay/shared/features/dashboard/view";
import { logAudit } from "@milipay/shared/features/audit/api";
import { supabase } from "@milipay/shared/lib/supabase";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNairaCompact, formatNairaWhole, initials, timeAgo } from "@milipay/shared/lib/utils/format";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { TONE_CLASSES, type Tone } from "@milipay/shared/components/ui/StatusBadge";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useToast } from "@milipay/shared/components/ui/Toast";

/**
 * Admin › Dashboard (design handoff "Admin Dashboard"): what needs a person
 * now, the day's numbers against the period before, the sign-up funnel and
 * tier mix, volume by hour, the live ledger, provider health and recent
 * admin activity. One read (public.admin_dashboard), refreshed when a
 * transaction changes and every minute.
 */

const SVC_ICON: Record<string, LucideIcon> = { palm: Hand, airtime: Smartphone, data: Wifi, power: Zap, cable: Tv, other: CircleDot };
const TONE_TEXT: Record<Tone, string> = { ok: "text-brand-text", warn: "text-warn", fail: "text-fail", info: "text-info", muted: "text-muted" };

function SvcIcon({ service, size, box }: { service: string; size: number; box: string }) {
  const s = SERVICE[service] ?? SERVICE.other;
  const Icon = SVC_ICON[service] ?? CircleDot;
  return (
    <div className={clsx("flex flex-none items-center justify-center", box)} style={{ background: s.color + "24", color: s.color }}>
      <Icon size={size} aria-hidden="true" />
    </div>
  );
}

function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={clsx("rounded-card border border-line bg-panel shadow-card", className)} style={style}>
      {children}
    </div>
  );
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[13px] font-semibold text-brand-text">
      {children}
    </Link>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { flash } = useToast();
  const [range, setRange] = useState<DashboardRange>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const seenTop = useRef<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchAdminDashboard(range);
      const top = d.ledger[0]?.id ?? null;
      if (seenTop.current && top && top !== seenTop.current) setFreshId(top);
      seenTop.current = top;
      setData(d);
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard.");
    }
  }, [range]);

  useEffect(() => {
    void load();
    const every = setInterval(() => void load(), 60_000);
    const ticker = setInterval(() => setTick((n) => n + 1), 15_000);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          void load();
        }, 3000);
      })
      .subscribe();
    return () => {
      clearInterval(every);
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const rangeInfo = RANGES.find((r) => r.id === range)!;

  const exportReport = () => {
    if (!data) return;
    const k = data.kpis;
    const rows: (string | number)[][] = [
      ["MiliPay dashboard", rangeInfo.label, new Date(data.generatedAt).toISOString()],
      [],
      ["Measure", "This period", "Previous period"],
      ["Processed volume (NGN)", k.volume, k.volumePrev],
      ["Platform revenue (NGN)", k.revenue, k.revenuePrev],
      ["Transactions", k.count, k.countPrev],
      ["Success rate (%)", k.successRate ?? "", k.successRatePrev ?? ""],
      [],
      ["Needs attention", "Count"],
      ...Object.entries(data.attention).map(([key, v]) => [key, v ?? ""]),
      [],
      ["Service", "Provider", "Volume", "Failed", "Success rate (%)"],
      ...healthRows(data.health).map((h) => [h.label, h.provider, h.total, h.failed, h.rate.toFixed(1)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `milipay-dashboard-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void logAudit({ category: "Transactions", action: "exported dashboard report", target: `${rangeInfo.label} report` }).then((ok) =>
      flash(ok ? "Report exported · logged to audit trail" : "Report exported"),
    );
  };

  const firstName = (user?.fullName || "").split(" ")[0];

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-5 p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <div className="mt-1 text-muted">
            Here's what's happening across MiliPay.{loadedAt ? ` Updated ${timeAgo(new Date(loadedAt))}.` : ""}
          </div>
        </div>
        <div className="flex gap-0.5 rounded-[10px] bg-chip p-[3px]" role="tablist" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={clsx(
                "rounded-lg px-3.5 py-[7px] text-[13px] font-semibold",
                range === r.id ? "bg-panel text-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportReport}
          disabled={!data}
          className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 font-semibold hover:bg-hover disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          Export report
        </button>
      </div>

      {error && !data && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}
      {!data && !error && <LoadingState title="Loading the dashboard" />}

      {data && (
        <>
          <Attention data={data} onGo={(to) => navigate(to)} />
          <Kpis data={data} versus={rangeInfo.versus} />

          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Funnel counts={data.funnel} />
            <Tiers tiers={data.tiers} />
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Hourly data={data} />
            <Ledger data={data} freshId={freshId} />
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Health data={data} />
            <RecentActivity data={data} />
          </div>
        </>
      )}

    </div>
  );
}

function Attention({ data, onGo }: { data: DashboardData; onGo: (to: string) => void }) {
  const a = data.attention;
  const oldest = a.oldestStuckMinutes;
  const cards: { key: keyof DashboardData["attention"]; label: string; icon: LucideIcon; tone: Tone; hint: string; to: string }[] = [
    {
      key: "stuck",
      label: "Stuck payments",
      icon: Hourglass,
      tone: "warn",
      hint: a.stuck && oldest !== null ? `Oldest ${timeAgo(new Date(Date.now() - oldest * 60000)).replace(" ago", "")}` : "Nothing waiting",
      to: ROUTES.operations,
    },
    { key: "refunds", label: "Refunds open", icon: Undo2, tone: "warn", hint: `${a.refundsFailed} failed to send`, to: ROUTES.operations },
    { key: "held", label: "Held for review", icon: ShieldAlert, tone: "fail", hint: "Amounts disagree", to: ROUTES.operations },
    { key: "offline", label: "Offline terminals", icon: WifiOff, tone: "fail", hint: "No heartbeat > 15 min", to: ROUTES.terminals },
    {
      key: "tickets",
      label: "Open tickets",
      icon: LifeBuoy,
      tone: "info",
      hint: `${a.ticketsCritical} critical · ${a.ticketsHigh} high`,
      to: ROUTES.support,
    },
    { key: "pending", label: "Agent registrations", icon: UserCheck, tone: "warn", hint: "Awaiting KYC review", to: `${ROUTES.customers}?tab=pending` },
    { key: "signups", label: "Sign-up reviews", icon: ScanFace, tone: "warn", hint: "Selfie failed or flagged", to: ROUTES.signups },
    { key: "mismatch", label: "Bank name mismatches", icon: Unlink, tone: "info", hint: "Last 7 days", to: ROUTES.signups },
  ];
  const total = cards.reduce((n, c) => n + (Number(a[c.key]) || 0), 0);

  return (
    <Panel className="px-5 py-[18px]">
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-[15px] font-bold">Needs attention</h2>
        <span
          className={clsx(
            "rounded-full px-2 py-[3px] text-xs font-semibold",
            total ? "bg-fail-soft text-fail" : "bg-brand-soft text-brand-text",
          )}
        >
          {total} {total === 1 ? "item" : "items"}
        </span>
        <span className="ml-auto text-xs text-muted">Zero is the only good number here.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const n = Number(a[c.key]) || 0;
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onGo(c.to)}
              className="flex flex-col gap-2.5 rounded-[14px] border border-line p-3.5 text-left transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-brand"
            >
              <span className="flex items-center justify-between">
                <span className={clsx("flex h-8 w-8 items-center justify-center rounded-[9px]", TONE_CLASSES[c.tone])}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <ArrowUpRight size={15} aria-hidden="true" className="text-muted" />
              </span>
              <span className={clsx("text-[26px] font-bold tabular-nums tracking-[-.02em]", n ? "text-fg" : "text-faint")}>{n}</span>
              <span>
                <span className="block text-[13px] font-semibold">{c.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{c.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function Kpis({ data, versus }: { data: DashboardData; versus: string }) {
  const k = data.kpis;
  const items: { label: string; icon: LucideIcon; value: string; d: ReturnType<typeof delta>; spark: (number | null)[] }[] = [
    { label: "Processed volume", icon: Banknote, value: formatNairaCompact(k.volume), d: delta(k.volume, k.volumePrev), spark: data.sparks.volume },
    { label: "Platform revenue", icon: Landmark, value: formatNairaCompact(k.revenue), d: delta(k.revenue, k.revenuePrev), spark: data.sparks.revenue },
    { label: "Transactions", icon: ArrowLeftRight, value: k.count.toLocaleString("en-NG"), d: delta(k.count, k.countPrev), spark: data.sparks.count },
    {
      label: "Success rate",
      icon: Gauge,
      value: k.successRate === null ? "—" : `${Number(k.successRate).toFixed(1)}%`,
      d: delta(k.successRate, k.successRatePrev, "points"),
      spark: data.sparks.successRate,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        const up = it.d?.up ?? true;
        const heights = sparkHeights(it.spark);
        return (
          <Panel key={it.label} className="flex flex-col gap-3 px-5 py-[18px]">
            <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
              <Icon size={15} aria-hidden="true" />
              {it.label}
            </div>
            <div className="flex items-end justify-between gap-2.5">
              <div>
                <div className="text-[26px] font-bold tabular-nums tracking-[-.02em]">{it.value}</div>
                <div className={clsx("mt-1 flex items-center gap-1 text-xs font-semibold", up ? "text-brand-text" : "text-fail")}>
                  {it.d ? (
                    <>
                      {up ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                      {it.d.text}
                    </>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                  <span className="font-medium text-faint">{versus}</span>
                </div>
              </div>
              <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
                {heights.map((h, i) => (
                  <div
                    key={i}
                    className={clsx("w-[5px] rounded-sm", i === heights.length - 1 ? (up ? "bg-brand" : "bg-fail") : "bg-line")}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Funnel({ counts }: { counts: number[] }) {
  const rows = funnelRows(counts);
  const conv = conversion(counts);
  return (
    <Panel className="px-5 py-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="flex-1 text-[15px] font-bold">Sign-up funnel</h2>
        {conv !== null && <div className="text-xs text-muted">{conv}% of people who start open an account</div>}
        <PanelLink to={ROUTES.signups}>Sign-ups</PanelLink>
      </div>
      {counts[0] ? (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {rows.map((r, i) => (
            <div key={r.label} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-[72px] items-end overflow-hidden rounded-[10px] bg-chip">
                <div
                  className="w-full rounded-t-[10px]"
                  style={{
                    height: `${r.share}%`,
                    background: i === rows.length - 1 ? "rgb(var(--brand))" : "color-mix(in oklch, rgb(var(--brand)) 55%, transparent)",
                  }}
                />
              </div>
              <div className="text-[17px] font-bold tabular-nums">{r.count.toLocaleString("en-NG")}</div>
              <div className="truncate text-xs text-muted">{r.label}</div>
              <div className={clsx("text-[11px] font-semibold", r.bad ? "text-fail" : "text-muted")}>{r.drop === null ? "" : `−${r.drop}%`}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-field p-5 text-center text-[13px] text-muted">Nobody has started signing up in this period.</div>
      )}
    </Panel>
  );
}

function Tiers({ tiers }: { tiers: Record<string, number> }) {
  const rows = tierRows(tiers);
  return (
    <Panel className="flex flex-col gap-3.5 px-5 py-[18px]">
      <div className="flex items-center">
        <h2 className="flex-1 text-[15px] font-bold">Customers by tier</h2>
        <PanelLink to={`${ROUTES.customers}?tab=tier1`}>Tier 1 list</PanelLink>
      </div>
      <div className="flex h-3 overflow-hidden rounded-md bg-chip">
        {rows.map((t) => (
          <div key={t.label} className="h-full" style={{ width: `${t.share}%`, background: t.color }} />
        ))}
      </div>
      {rows.map((t) => (
        <div key={t.label} className="flex items-center gap-2.5 text-[13px]">
          <div className="h-2.5 w-2.5 rounded-[3px]" style={{ background: t.color }} />
          <div className="flex-1 text-muted">{t.label}</div>
          <div className="font-bold tabular-nums">{t.count.toLocaleString("en-NG")}</div>
          <div className="w-10 text-right tabular-nums text-faint">{Math.round(t.share)}%</div>
        </div>
      ))}
      <div className="border-t border-line2 pt-2.5 text-xs leading-[1.45] text-muted">
        Tier 1 customers move to Tier 2 when an agent captures their palm.
      </div>
    </Panel>
  );
}

function Hourly({ data }: { data: DashboardData }) {
  const today = data.range === "today";
  const max = Math.max(0, ...data.hourly.map((h) => h.delivered + h.failed));
  const ticks = yTicks(max);
  return (
    <Panel className="flex flex-col px-5 py-[18px]">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="flex-1 text-[15px] font-bold">Volume by hour</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <div className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
          Delivered
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <div className="h-2.5 w-2.5 rounded-[3px] bg-fail" />
          Failed / refunded
        </div>
      </div>
      <div className="relative mt-[18px] flex h-[230px] gap-2">
        <div className="flex w-11 flex-col justify-between pb-[22px] text-right text-[11px] tabular-nums text-faint">
          {ticks.labels.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>
        <div className="flex flex-1 flex-col">
          <div
            className="flex flex-1 items-end gap-1.5 border-b border-line"
            style={{
              background:
                "repeating-linear-gradient(to bottom,transparent 0,transparent calc(33.33% - 1px),rgb(var(--line2)) calc(33.33% - 1px),rgb(var(--line2)) 33.33%)",
            }}
          >
            {data.hourly.map((h) => {
              const future = today && h.hour > data.nowHour;
              const dh = future ? 0 : (h.delivered / ticks.top) * 100;
              const fh = future ? 0 : (h.failed / ticks.top) * 100;
              const hh = String(h.hour).padStart(2, "0");
              return (
                <div
                  key={h.hour}
                  title={`${hh}:00 · ${formatNairaCompact(h.delivered)} delivered · ${formatNairaCompact(h.failed)} failed`}
                  className="flex h-full flex-1 flex-col justify-end"
                  style={{ opacity: today && h.hour === data.nowHour ? 0.6 : 1 }}
                >
                  <div className="rounded-t-[3px] bg-fail" style={{ height: `${fh}%` }} />
                  <div className={clsx("bg-brand", h.failed > 0 ? "" : "rounded-t-[3px]")} style={{ height: `${dh}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex h-[22px] items-end gap-1.5">
            {data.hourly.map((h) => (
              <div key={h.hour} className="flex-1 text-center text-[10px] text-faint">
                {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Ledger({ data, freshId }: { data: DashboardData; freshId: string | null }) {
  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-5 pb-3 pt-[18px]">
        <div className="h-2 w-2 animate-pulse-dot rounded-full bg-brand" />
        <h2 className="flex-1 text-[15px] font-bold">Live ledger</h2>
        <PanelLink to={ROUTES.transactions}>View all</PanelLink>
      </div>
      <div className="flex max-h-[262px] flex-1 flex-col overflow-hidden">
        {data.ledger.length === 0 && <div className="border-t border-line2 px-5 py-6 text-center text-[13px] text-muted">No payments yet.</div>}
        {data.ledger.map((t) => {
          const st = presentTransactionStatus(t.status);
          const service = t.palm ? "palm" : t.serviceType || "other";
          return (
            <Link
              key={t.id}
              to={ROUTES.transactionDetails.replace(":id", t.id)}
              className={clsx("flex items-center gap-2.5 border-t border-line2 px-5 py-[9px] hover:bg-hover", t.id === freshId && "animate-tick-in")}
            >
              <SvcIcon service={service} size={15} box="h-[30px] w-[30px] rounded-[9px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{ledgerTitle(t)}</div>
                <div className="truncate font-mono text-[11px] text-muted">
                  {t.reference} · {timeAgo(t.createdAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-semibold tabular-nums">{formatNairaWhole(t.amount)}</div>
                <div className={clsx("text-[11px] font-semibold", TONE_TEXT[st.tone])}>{st.label}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function Health({ data }: { data: DashboardData }) {
  const rows = healthRows(data.health);
  const cols = "grid grid-cols-[1.4fr_.7fr_.7fr_1.3fr] gap-3";
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center px-5 pb-3 pt-[18px]">
        <h2 className="flex-1 text-[15px] font-bold">Provider health</h2>
        <PanelLink to={ROUTES.operations}>Operations</PanelLink>
      </div>
      <div className={clsx(cols, "border-y border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
        <div>Service · provider</div>
        <div className="text-right">Volume</div>
        <div className="text-right">Failed</div>
        <div>Success rate</div>
      </div>
      {rows.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-muted">No payments reached a provider in this period.</div>}
      {rows.map((h) => (
        <div key={h.service + h.provider} className={clsx(cols, "items-center border-b border-line2 px-5 py-[11px]")}>
          <div className="flex min-w-0 items-center gap-2.5">
            <SvcIcon service={h.service} size={14} box="h-7 w-7 rounded-lg" />
            <div className="min-w-0">
              <div className="font-semibold">{h.label}</div>
              <div className="truncate text-xs text-muted">{h.provider}</div>
            </div>
          </div>
          <div className="text-right tabular-nums">{h.total.toLocaleString("en-NG")}</div>
          <div className={clsx("text-right tabular-nums", h.low ? "text-fail" : "text-muted")}>{h.failed.toLocaleString("en-NG")}</div>
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-chip">
              <div className={clsx("h-full rounded-[3px]", h.low ? "bg-warn" : "bg-brand")} style={{ width: `${h.rate}%` }} />
            </div>
            <div className={clsx("w-11 text-right font-semibold tabular-nums", h.low ? "text-warn" : "text-fg")}>{h.rate.toFixed(1)}%</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

function RecentActivity({ data }: { data: DashboardData }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center px-5 pb-3 pt-[18px]">
        <h2 className="flex-1 text-[15px] font-bold">Recent admin activity</h2>
        <PanelLink to={ROUTES.audit}>Audit log</PanelLink>
      </div>
      {data.recentAudit.length === 0 && (
        <div className="border-t border-line2 px-5 py-6 text-center text-[13px] text-muted">Nothing recorded yet.</div>
      )}
      {data.recentAudit.map((e) => (
        <div key={e.id} className="flex gap-3 border-t border-line2 px-5 py-2.5">
          <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-muted">
            {e.actorRole === "system" ? "SY" : initials(e.actorName)}
          </div>
          <div className="min-w-0 flex-1 text-[13px] leading-[1.45]">
            <span className="font-semibold">{e.actorName}</span> <span className="text-muted">{e.action}</span>{" "}
            {e.target && <span className="font-semibold">{e.target}</span>}
            <div className="mt-px text-xs text-faint">
              {timeAgo(e.occurredAt)} · {e.category}
              {e.result === "denied" ? " · Denied" : ""}
            </div>
          </div>
        </div>
      ))}
    </Panel>
  );
}
