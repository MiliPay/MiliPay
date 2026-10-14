import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarPlus, Download, ListOrdered, Search, Smartphone } from "lucide-react";
import clsx from "clsx";
import { StatCard } from "@milipay/shared/components/ui/StatCard";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  WAITLIST_PAGE,
  exportWaitlist,
  fetchWaitlist,
  formatLocalPhone,
  waitlistCsv,
  waitlistPageLabel,
  type WaitlistPage as WaitlistData,
  type WaitlistRow,
} from "@milipay/shared/features/website/admin";
import { whenLabel } from "@milipay/shared/lib/utils/format";
import { EmptyState } from "./EmptyState";

/**
 * Website → Waitlist: the numbers that asked for a text when the app is in
 * the stores. Exporting hands out phone numbers, so the server records every
 * export on the audit log.
 */

const COLS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_130px_150px] gap-3.5";

export default function WaitlistPage() {
  const { flash } = useToast();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<WaitlistData | null>(null);
  const [rows, setRows] = useState<WaitlistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const page = await fetchWaitlist(query);
      setData(page);
      setRows(page.rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the waitlist.");
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!rows) return;
    setMore(true);
    try {
      const page = await fetchWaitlist(query, rows.length);
      setRows([...rows, ...page.rows]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not load more.", "fail");
    } finally {
      setMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await exportWaitlist();
      const url = URL.createObjectURL(new Blob([waitlistCsv(all)], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `milipay-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash(`${all.length.toLocaleString("en-NG")} numbers exported · this export is logged`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed.", "fail");
    } finally {
      setExporting(false);
    }
  };

  const fmt = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-NG"));

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Waitlist</h1>
          <div className="mt-1 text-muted">People who asked the website for a text when the app is in the stores. One row per number.</div>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || !data?.total}
          className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 font-semibold hover:bg-hover disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <StatCard label="On the waitlist" value={fmt(data?.total)} icon={<ListOrdered size={18} />} tone="info" />
        <StatCard label="Joined today" value={fmt(data?.today)} icon={<CalendarPlus size={18} />} tone="ok" />
        <StatCard label="Launch SMS sent" value={fmt(data?.notified)} icon={<BellRing size={18} />} tone="muted" />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch value={q} onChange={setQ} width={260} placeholder="Search a phone number" icon={<Search size={15} aria-hidden="true" />} />
          {data && query && <div className="text-[13px] text-muted">{fmt(data.matching)} matching</div>}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Phone</div>
              <div>Joined from</div>
              <div>Joined</div>
              <div>Launch SMS</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !rows && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && rows && rows.length === 0 && (
              <EmptyState
                icon={Smartphone}
                title={query ? "No number matches this" : "Nobody on the waitlist yet"}
                body={query ? "Search with or without the leading 0 or +234." : "Numbers people leave on the website's download sections appear here."}
              />
            )}
            {rows?.map((r) => (
              <div key={r.id} className={clsx(COLS, "h-[48px] items-center border-b border-line2 px-5")}>
                <div className="font-mono text-[13px] font-semibold">{formatLocalPhone(r.phone)}</div>
                <div className="truncate text-[13px] text-muted">{waitlistPageLabel(r.page)}</div>
                <div className="text-[13px] text-muted">{whenLabel(r.createdAt)}</div>
                <div>{r.notifiedAt ? <Pill tone="ok">Sent {whenLabel(r.notifiedAt)}</Pill> : <Pill tone="muted">Not yet</Pill>}</div>
              </div>
            ))}
            {rows && data && rows.length < data.matching && rows.length >= WAITLIST_PAGE && (
              <div className="flex justify-center p-4">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={more}
                  className="flex h-9 items-center rounded-[9px] border border-line px-3.5 text-[13px] font-semibold hover:bg-hover disabled:opacity-50"
                >
                  {more ? "Loading…" : `Show more (${(data.matching - rows.length).toLocaleString("en-NG")} left)`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
