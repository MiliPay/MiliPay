import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Hand, ScanFace, Search, UserPlus } from "lucide-react";
import clsx from "clsx";
import { Tabs, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { fetchStaffCustomers, type CustomerList, type CustomerRow, type CustomerTab } from "@milipay/shared/features/customers/admin";
import { ROUTES } from "@milipay/shared/lib/constants";
import { initials } from "@milipay/shared/lib/utils/format";

/**
 * Customers (design handoff, admin "Customers"): tabs by status with counts,
 * including Tier 1 without a palm; search by name, phone or the last 4 of the
 * NIN; 20 a page. Shared by the admin, support and agent portals — agents see
 * only the people they registered, and only admins see "Register customer".
 */

const PER_PAGE = 20;
const TABS: { id: CustomerTab; label: string; hot?: boolean }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending review", hot: true },
  { id: "active", label: "Active" },
  { id: "tier1", label: "Tier 1 · no palm" },
  { id: "suspended", label: "Suspended" },
  { id: "rejected", label: "Rejected" },
];
const COLS = "grid grid-cols-[minmax(0,1.6fr)_90px_90px_80px_90px_70px_130px_minmax(0,1fr)_90px] gap-3.5";

/** The detail path in whichever portal this list is showing in. */
export function customerPath(pathname: string, id: string): string {
  return pathname.startsWith("/dashboard/") ? ROUTES.customerDetails.replace(":id", id) : `/customers/${id}`;
}

const joined = (iso: string) => {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: "Africa/Lagos" }).format(x);
  return day(d) === day(new Date()) ? "Today" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(d);
};

export default function CustomersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "all") as CustomerTab;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<CustomerList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setData(await fetchStaffCustomers({ tab, q: query, offset: page * PER_PAGE, limit: PER_PAGE }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customers.");
    }
  }, [tab, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (t: CustomerTab) => {
    setPage(0);
    setParams(t === "all" ? {} : { tab: t }, { replace: true });
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const subtitle =
    user?.role === "agent"
      ? "The people you've registered. New registrations wait for a KYC review before they can pay."
      : "Everyone with a MiliPay account. Self sign-ups start on Tier 1; agent registrations need a KYC review before they can pay.";

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Customers</h1>
          <div className="mt-1 text-muted">{subtitle}</div>
        </div>
        {isAdmin && (
          <Link
            to={ROUTES.registerCustomer}
            className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-3.5 font-bold text-brand-ink"
          >
            <UserPlus size={16} aria-hidden="true" />
            Register customer
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <Tabs tabs={TABS.map((t) => ({ ...t, count: data?.counts[t.id] ?? null }))} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch value={q} onChange={setQ} width={340} placeholder="Name, phone or last 4 of NIN" icon={<Search size={15} aria-hidden="true" />} />
          <div className="flex-1" />
          {data && <div className="text-[13px] text-muted">{total.toLocaleString("en-NG")} customer{total === 1 ? "" : "s"}</div>}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Customer</div>
              <div>NIN</div>
              <div>State</div>
              <div>Tier</div>
              <div>Biometrics</div>
              <div>Banks</div>
              <div>Status</div>
              <div>Registered by</div>
              <div className="text-right">Joined</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && data && data.rows.length === 0 && <div className="p-12 text-center text-muted">No customers match.</div>}
            {!error && !data && <div className="p-12 text-center text-muted">Loading…</div>}
            {data?.rows.map((c) => (
              <Row key={c.id} c={c} onOpen={() => navigate(customerPath(pathname, c.id))} />
            ))}
          </div>
        </div>

        {total > PER_PAGE && (
          <div className="flex items-center gap-2.5 px-5 py-3">
            <div className="flex-1 text-[13px] text-muted">
              Showing {page * PER_PAGE + 1}–{Math.min(total, page * PER_PAGE + PER_PAGE)} of {total.toLocaleString("en-NG")}
            </div>
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold disabled:opacity-40"
            >
              <ChevronLeft size={15} aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages - 1}
              className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold disabled:opacity-40"
            >
              Next
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ c, onOpen }: { c: CustomerRow; onOpen: () => void }) {
  const self = c.source === "self";
  return (
    <button type="button" onClick={onOpen} className={clsx(COLS, "h-14 w-full items-center border-b border-line2 px-5 text-left hover:bg-hover")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-text">
          {initials(c.name) || "?"}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.name || "No name yet"}</div>
          <div className="font-mono text-xs text-muted">{c.phone}</div>
        </div>
      </div>
      <div className="font-mono text-[12.5px] text-muted">{c.ninLast4 ? `••${c.ninLast4}` : "—"}</div>
      <div className="truncate text-muted">{c.state || "—"}</div>
      <div>
        <span className="inline-flex rounded-md bg-chip px-2 py-0.5 text-xs font-semibold text-muted">Tier {c.tier ?? "—"}</span>
      </div>
      <div className="flex gap-1.5">
        <Bio on={c.palm} title={c.palm ? "Palm vein on file" : "No palm"} icon={<Hand size={14} />} />
        <Bio on={c.face} title={c.face ? "Face on file" : "No face"} icon={<ScanFace size={14} />} />
      </div>
      <div className="tabular-nums text-muted">{c.banks}</div>
      <div>
        <StatusBadge status={c.status} />
      </div>
      <div className="min-w-0 truncate text-[13px]">
        {self ? (
          <>
            Self sign-up <span className="text-faint">· App</span>
          </>
        ) : (
          <>
            {c.registeredBy || "—"} {c.registeredState && <span className="text-faint">· {c.registeredState}</span>}
          </>
        )}
      </div>
      <div className="text-right text-[13px] text-muted">{joined(c.createdAt)}</div>
    </button>
  );
}

function Bio({ on, title, icon }: { on: boolean; title: string; icon: ReactNode }) {
  return (
    <span title={title} aria-label={title} className={clsx("flex h-[26px] w-[26px] items-center justify-center rounded-[7px]", on ? "bg-brand-soft text-brand-text" : "bg-chip text-faint")}>
      {icon}
    </span>
  );
}
