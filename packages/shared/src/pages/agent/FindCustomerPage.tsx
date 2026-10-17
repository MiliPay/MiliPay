import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpCircle, Eye, Search, Wrench } from "lucide-react";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import { findCustomers, registrationStatus, type FoundCustomer } from "@milipay/shared/features/agent/api";
import { initials } from "@milipay/shared/lib/utils/format";
import { Empty, ErrorLine, Page, PageHeader, Panel } from "./parts";

/**
 * Find customer (handoff screen 3): everyone on MiliPay, by phone, the last
 * 4 digits of the NIN, or name. The header search lands here with ?q=.
 */
export default function FindCustomerPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<FoundCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setRows(null);
      return;
    }
    const t = setTimeout(() => {
      findCustomers(term).then(
        (r) => {
          setRows(r);
          setError(null);
        },
        (e) => setError(e instanceof Error ? e.message : "Search didn't work. Try again."),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Page>
      <PageHeader title="Find customer" sub="Search everyone on MiliPay by phone, the last 4 digits of their NIN, or name." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParams(q.trim() ? { q: q.trim() } : {});
        }}
        className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-panel px-4"
      >
        <Search size={18} className="text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="0803 123 4567, 4821 or Adaeze Okafor"
          aria-label="Search customers"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
        />
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}

      {rows === null ? (
        <Empty>Type at least 3 characters to search.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No one on MiliPay matches “{q.trim()}”.</Empty>
      ) : (
        <Panel className="!p-0">
          <div className="divide-y divide-line">
            {rows.map((c) => {
              const [label, tone] = registrationStatus(c);
              const canUpgrade = c.tier === 1 && c.status === "active" && !c.palm;
              const canFix = c.mine && c.status === "rejected";
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-chip text-sm font-semibold text-fg">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-[180px] flex-1">
                    <div className="text-sm font-semibold text-fg">{c.name}</div>
                    <div className="font-mono text-[13px] text-muted">
                      {c.phone}
                      {c.ninLast4 ? ` · NIN ••••${c.ninLast4}` : ""}
                    </div>
                    {canFix && c.reason && <div className="mt-0.5 text-[13px] text-fail">{c.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone="muted">Tier {c.tier}</Pill>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                  <div className="flex gap-2">
                    {canUpgrade && (
                      <button
                        type="button"
                        onClick={() => navigate(`${AGENT_ROUTES.upgrade}?customer=${c.id}`)}
                        className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-ink"
                      >
                        <ArrowUpCircle size={14} /> Upgrade to Tier 2
                      </button>
                    )}
                    {canFix && (
                      <button
                        type="button"
                        onClick={() => navigate(`${AGENT_ROUTES.registrations}?tab=fix&id=${c.id}`)}
                        className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-fg hover:bg-hover"
                      >
                        <Wrench size={14} /> Fix and resubmit
                      </button>
                    )}
                    {c.mine && (
                      <button
                        type="button"
                        onClick={() => navigate(`${AGENT_ROUTES.registrations}?id=${c.id}`)}
                        className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-fg hover:bg-hover"
                      >
                        <Eye size={14} /> View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </Page>
  );
}
