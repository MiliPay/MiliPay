import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, CircleDot, Download, Hand, Search, Smartphone, Tv, Wifi, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Chips, Tabs, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { TransactionDrawer } from "@milipay/shared/components/transactions/TransactionDrawer";
import {
  fetchAdminTransactions,
  serviceOf,
  type TxPage,
  type TxRow,
  type TxService,
  type TxTab,
} from "@milipay/shared/features/transactions/admin";
import { SERVICE, providerName } from "@milipay/shared/features/dashboard/view";
import { logAudit } from "@milipay/shared/features/audit/api";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNairaWhole, initials, whenLabel } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Transactions (design handoff): tabs by outcome with counts, service
 * chips, search by reference, customer or merchant, 14 rows a page, and the
 * transaction drawer on top. /dashboard/transactions/:id opens the drawer
 * directly, so a link to one transaction still works.
 */

const PER_PAGE = 14;
const SVC_ICON: Record<string, LucideIcon> = { palm: Hand, airtime: Smartphone, data: Wifi, power: Zap, cable: Tv, other: CircleDot };
const TABS: { id: TxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "delivered", label: "Delivered" },
  { id: "flight", label: "In flight" },
  { id: "failed", label: "Failed" },
  { id: "refunds", label: "Refunds" },
  { id: "held", label: "Held for review" },
];
const SERVICES: { id: TxService; label: string }[] = [
  { id: "all", label: "All services" },
  { id: "palm", label: "Palm" },
  { id: "airtime", label: "Airtime" },
  { id: "data", label: "Data" },
  { id: "power", label: "Electricity" },
  { id: "cable", label: "Cable TV" },
];
const COLS = "grid grid-cols-[130px_minmax(0,1.3fr)_minmax(0,1.3fr)_110px_80px_150px_100px] gap-3.5";

export default function TransactionsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { flash } = useToast();
  const [tab, setTab] = useState<TxTab>("all");
  const [service, setService] = useState<TxService>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<TxPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Typing settles for a moment before it searches.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setData(await fetchAdminTransactions({ tab, service, q: query, offset: page * PER_PAGE, limit: PER_PAGE }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load transactions.");
    }
  }, [tab, service, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (row: TxRow) => navigate(ROUTES.transactionDetails.replace(":id", row.id));
  const close = () => navigate(ROUTES.transactions);

  const exportCsv = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const rows: TxRow[] = [];
      for (let offset = 0; offset < Math.min(data.total, 5000); offset += 100) {
        const p = await fetchAdminTransactions({ tab, service, q: query, offset, limit: 100 });
        rows.push(...p.rows);
      }
      const head = ["Reference", "Date", "Customer", "Service", "Provider or merchant", "Amount (NGN)", "Fee (NGN)", "Status"];
      const body = rows.map((r) => [
        r.reference,
        r.createdAt,
        r.customer,
        (SERVICE[serviceOf(r)] ?? SERVICE.other).label,
        r.palm ? r.merchantName ?? "" : providerName(r.provider),
        r.amount,
        r.fee,
        presentTransactionStatus(r.status).label,
      ]);
      const csv = [head, ...body].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `milipay-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const logged = await logAudit({
        category: "Transactions",
        action: "exported transactions",
        target: `${rows.length.toLocaleString("en-NG")} rows`,
        after: { tab, service, search: query || null },
      });
      flash(`Exported ${rows.length.toLocaleString("en-NG")} rows${logged ? " · logged to audit trail" : ""}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed.", "fail");
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Transactions</h1>
          <div className="mt-1 text-muted">Every payment across palm terminals and quick services.</div>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={!data || exporting}
          className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 font-semibold hover:bg-hover disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <Tabs
          tabs={TABS.map((t) => ({ ...t, count: data?.counts[t.id] ?? null }))}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(0);
          }}
        />
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch value={q} onChange={setQ} placeholder="Reference, customer or merchant" icon={<Search size={15} aria-hidden="true" />} />
          <Chips
            options={SERVICES.map((s) => {
              const Icon = SVC_ICON[s.id];
              return { ...s, icon: s.id === "all" ? undefined : <Icon size={14} aria-hidden="true" /> };
            })}
            value={service}
            onChange={(s) => {
              setService(s);
              setPage(0);
            }}
          />
          <div className="flex-1" />
          {data && (
            <div className="text-[13px] text-muted">
              {formatNairaWhole(data.amount)} across {total.toLocaleString("en-NG")} transaction{total === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Reference</div>
              <div>Customer</div>
              <div>Service · merchant</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Fee</div>
              <div>Status</div>
              <div className="text-right">Time</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && data && data.rows.length === 0 && <div className="p-12 text-center text-muted">No transactions match these filters.</div>}
            {!error && !data && <div className="p-12 text-center text-muted">Loading…</div>}
            {data?.rows.map((t) => {
              const svc = serviceOf(t);
              const s = SERVICE[svc] ?? SERVICE.other;
              const Icon = SVC_ICON[svc] ?? CircleDot;
              const st = presentTransactionStatus(t.status);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => open(t)}
                  className={clsx(COLS, "h-[52px] w-full items-center border-b border-line2 px-5 text-left hover:bg-hover", id === t.id && "bg-hover")}
                >
                  <div className="truncate font-mono text-[12.5px] font-medium">{t.reference}</div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-chip text-[10px] font-bold text-muted">
                      {initials(t.customer) || "?"}
                    </div>
                    <div className="truncate font-medium">{t.customer || "Unknown"}</div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px]" style={{ background: s.color + "24", color: s.color }}>
                      <Icon size={13} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 truncate">
                      <span className="font-medium">{t.palm ? t.merchantName : providerName(t.provider)}</span>{" "}
                      {!t.palm && <span className="text-muted">{s.label}</span>}
                    </div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{formatNairaWhole(t.amount)}</div>
                  <div className="text-right tabular-nums text-muted">{formatNairaWhole(t.fee)}</div>
                  <div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="text-right text-[13px] text-muted">{whenLabel(t.createdAt)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-3">
          <div className="flex-1 text-[13px] text-muted">
            {total > 0 && `Showing ${page * PER_PAGE + 1}–${Math.min(total, page * PER_PAGE + PER_PAGE)} of ${total.toLocaleString("en-NG")}`}
          </div>
          <button
            type="button"
            onClick={() => page > 0 && setPage(page - 1)}
            disabled={page === 0}
            className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold disabled:opacity-40"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => page < pages - 1 && setPage(page + 1)}
            disabled={page >= pages - 1}
            className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold disabled:opacity-40"
          >
            Next
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <TransactionDrawer txKey={id ?? null} onClose={close} onChanged={() => void load()} />
    </div>
  );
}
