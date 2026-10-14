import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Hand, Search } from "lucide-react";
import clsx from "clsx";
import { personPath } from "@milipay/shared/components/layout/ServiceLayout";
import { ago, searchPeople, type Person } from "@milipay/shared/features/support/desk";
import { initials } from "@milipay/shared/lib/utils/format";

/**
 * Support › Customers (design handoff, MiliPay Support "Find a customer"):
 * one search across phone, last 4 of NIN, name, payment reference and ticket
 * number. With nothing typed, the people who contacted support most recently.
 * Read-only: changes to an account go to an admin.
 */

const COLS = "grid grid-cols-[minmax(0,1.5fr)_150px_90px_120px_110px_110px] gap-3.5";

export function tierLabel(p: Pick<Person, "kind" | "tier" | "signupStep">): string {
  if (p.kind === "applicant") return `Signing up · ${p.signupStep ?? 1}/5`;
  return p.tier === 1 ? "Tier 1" : `Tier ${p.tier ?? 2}`;
}

export default function SupportCustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchPeople(q.trim()).then(
        (r) => {
          if (!live) return;
          setRows(r);
          setError(null);
        },
        (e) => live && setError(e instanceof Error ? e.message : "Search failed."),
      );
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // setParams changes identity on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex max-w-[1200px] animate-fade-in flex-col gap-[18px] px-4 py-[26px] sm:px-7">
      <div>
        <div className="text-2xl font-bold tracking-[-.02em]">Find a customer</div>
        <div className="mt-1 text-muted">Search by phone number, last 4 of NIN, name or a payment reference.</div>
      </div>
      <div className="flex h-[52px] items-center gap-3 rounded-[14px] border-[1.5px] border-brand bg-panel px-4 text-faint shadow-[0_0_0_4px_var(--brand-soft)]">
        <Search size={18} aria-hidden="true" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. 0803 123 4567 or Adaeze"
          aria-label="Find a customer"
          className="h-full flex-1 bg-transparent text-base text-fg outline-none placeholder:text-faint"
        />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Customer</div>
              <div>Phone</div>
              <div>Tier</div>
              <div>Palm</div>
              <div>Open tickets</div>
              <div className="text-right">Last contact</div>
            </div>
            {error && <div className="px-5 py-5 text-[13px] text-fail">{error}</div>}
            {!rows && !error && <div className="px-5 py-5 text-[13px] text-muted">Searching…</div>}
            {rows && rows.length === 0 && (
              <div className="px-5 py-5 text-[13px] text-muted">{q.trim() ? `No customer matches "${q.trim()}".` : "Nobody has contacted support yet."}</div>
            )}
            {rows?.map((p) => (
              <button
                key={p.kind + p.id}
                type="button"
                onClick={() => navigate(personPath(p))}
                className={clsx(COLS, "h-[54px] w-full items-center border-b border-line2 px-5 text-left hover:bg-hover")}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-text">
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    {p.match && <span className="block truncate text-xs text-muted">{p.match.replace(/^ · /, "")}</span>}
                  </span>
                </span>
                <span className="font-mono text-[12.5px] text-muted">{p.phone}</span>
                <span className="text-muted">{tierLabel(p)}</span>
                <span className={clsx("flex items-center gap-1.5 text-[13px]", p.palm ? "text-brand-text" : "text-faint")}>
                  <Hand size={14} aria-hidden="true" />
                  {p.palm ? "Active" : "None"}
                </span>
                <span className={clsx("font-semibold", p.openTickets ? "text-warn" : "text-faint")}>{p.openTickets}</span>
                <span className="text-right text-[13px] text-muted">{p.lastContact ? `${ago(p.lastContact)} ago` : "—"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
