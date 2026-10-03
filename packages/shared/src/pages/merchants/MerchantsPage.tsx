import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, Search } from "lucide-react";
import clsx from "clsx";
import { Chips, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import {
  MERCHANT_STATUS,
  categoryStyle,
  feeLabel,
  fetchMerchantList,
  merchantPath,
  onboardedLabel,
  registerMerchantPath,
  scheduleLabel,
  type MerchantFilter,
  type MerchantList,
  type MerchantRow,
} from "@milipay/shared/features/merchants/admin";
import { formatNairaCompact } from "@milipay/shared/lib/utils/format";
import { CategoryIcon, StatTile } from "./parts";

/**
 * Merchants (design handoff, admin "Merchants"): totals, search by business
 * or director, a status filter, and a row per business. Shared by the admin
 * and agent portals; an agent sees the merchants they registered.
 */

const FILTERS: { id: MerchantFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "suspended", label: "Suspended" },
];
const COLS = "grid grid-cols-[minmax(0,1.6fr)_90px_110px_130px_70px_100px_120px_90px] gap-3.5";

export default function MerchantsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [filter, setFilter] = useState<MerchantFilter>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<MerchantList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAgent = user?.role === "agent";

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setData(await fetchMerchantList(filter, query));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load merchants.");
    }
  }, [filter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.stats;
  const stats: [string, string][] = [
    ["Active merchants", s ? String(s.active) : "—"],
    ["Volume · 30 days", s ? formatNairaCompact(s.volume) : "—"],
    ["Fees earned · 30 days", s ? formatNairaCompact(s.fees) : "—"],
    ["Awaiting approval", s ? String(s.pending) : "—"],
  ];

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Merchants</h1>
          <div className="mt-1 text-muted">
            {isAgent ? "The businesses you've registered. New merchants wait for an admin to approve them." : "Businesses that accept palm payments on MiliPay terminals."}
          </div>
        </div>
        <Link
          to={registerMerchantPath(pathname)}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-3.5 font-bold text-brand-ink"
        >
          <Building2 size={16} aria-hidden="true" />
          Register merchant
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch value={q} onChange={setQ} width={320} placeholder="Business or director name" icon={<Search size={15} aria-hidden="true" />} />
          <Chips<MerchantFilter> options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Business</div>
              <div>State</div>
              <div>Terminals</div>
              <div className="text-right">Volume · 30d</div>
              <div className="text-right">Fee</div>
              <div>Settlement</div>
              <div>Status</div>
              <div className="text-right">Onboarded</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !data && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && data && data.rows.length === 0 && (
              <div className="p-12 text-center text-muted">{query || filter !== "all" ? "No merchants match." : "No merchants yet."}</div>
            )}
            {data?.rows.map((m) => (
              <Row key={m.id} m={m} onOpen={() => navigate(merchantPath(pathname, m.id))} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ m, onOpen }: { m: MerchantRow; onOpen: () => void }) {
  const cat = categoryStyle(m.category);
  const [label, tone] = MERCHANT_STATUS[m.status] ?? [m.status, "muted"];
  return (
    <button type="button" onClick={onOpen} className={clsx(COLS, "h-14 w-full items-center border-b border-line2 px-5 text-left hover:bg-hover")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <CategoryIcon category={m.category} size={32} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{m.name}</div>
          <div className="text-xs text-muted">{cat.label}</div>
        </div>
      </div>
      <div className="truncate text-muted">{m.state}</div>
      <div className="flex items-center gap-2">
        <span className="font-semibold tabular-nums">
          {m.online} / {m.terminals}
        </span>
        {m.offline > 0 && <span className="h-[7px] w-[7px] rounded-full bg-fail" title={`${m.offline} offline`} aria-label={`${m.offline} offline`} />}
      </div>
      <div className="text-right font-semibold tabular-nums">{formatNairaCompact(m.volume)}</div>
      <div className="text-right tabular-nums text-muted">{feeLabel(m.fee)}</div>
      <div className="text-[13px] text-muted">{scheduleLabel(m.schedule)}</div>
      <div>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <div className="text-right text-[13px] text-muted">{onboardedLabel(m.createdAt)}</div>
    </button>
  );
}
