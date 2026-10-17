import { useEffect, useState } from "react";
import { Medal } from "lucide-react";
import { Chips } from "@milipay/shared/components/ui/Tabs";
import {
  COMMISSION_LABEL,
  MEDALS,
  fetchEarnings,
  fetchLeaderboard,
  payoutLabel,
  type Earnings,
  type Leaderboard,
  type LeaderboardPeriod,
} from "@milipay/shared/features/agent/api";
import { formatDate, formatNaira, initials } from "@milipay/shared/lib/utils/format";
import { AutoGrid, Empty, ErrorLine, Kpi, Page, PageHeader, Panel, SectionTitle } from "./parts";

/** Earnings (handoff screen 10). */
export function EarningsPage() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEarnings().then(setData, (e) => setError(e instanceof Error ? e.message : "Could not load your earnings."));
  }, []);

  const total = data ? data.breakdown.reduce((s, b) => s + b.count * b.rate, 0) : 0;

  return (
    <Page>
      <PageHeader title="Earnings" sub="Commission counts once a registration is approved. Paid weekly, on Fridays." />
      {error && <ErrorLine>{error}</ErrorLine>}
      {data ? (
        <>
          <AutoGrid min={210}>
            <Kpi label="Today" value={formatNaira(data.today)} />
            <Kpi label="This month" value={formatNaira(data.month)} tone="brand" />
            <Kpi label="Waiting approval" value={formatNaira(data.pending)} tone="warn" sub="Paid once admin approves" />
            <Kpi label="Next payout" value={payoutLabel(data.nextPayout)} sub="Every Friday" />
          </AutoGrid>
          <Panel>
            <SectionTitle>This month by type</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[.06em] text-faint">
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 text-right font-semibold">Count</th>
                    <th className="pb-2 text-right font-semibold">Rate</th>
                    <th className="pb-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((b) => (
                    <tr key={b.kind} className="border-t border-line">
                      <td className="py-3 text-fg">{COMMISSION_LABEL[b.kind]}</td>
                      <td className="py-3 text-right text-fg">{b.count}</td>
                      <td className="py-3 text-right text-muted">{formatNaira(b.rate)}</td>
                      <td className="py-3 text-right font-semibold text-fg">{formatNaira(b.count * b.rate)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className="py-3 font-semibold text-fg" colSpan={3}>
                      Total
                    </td>
                    <td className="py-3 text-right font-bold text-brand-text">{formatNaira(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel>
            <SectionTitle>Payout history</SectionTitle>
            {data.payouts.length === 0 ? (
              <Empty>No payouts yet. Your first one comes on {payoutLabel(data.nextPayout)}.</Empty>
            ) : (
              <div className="divide-y divide-line">
                {data.payouts.map((p) => (
                  <div key={`${p.periodStart}-${p.periodEnd}`} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-[180px] flex-1">
                      <div className="font-semibold text-fg">
                        {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                      </div>
                      <div className="font-mono text-[13px] text-muted">{p.reference ?? "—"}</div>
                    </div>
                    <div className={`text-[13px] ${p.paidAt ? "text-brand-text" : "text-warn"}`}>{p.paidAt ? `Paid ${formatDate(p.paidAt)}` : "Processing"}</div>
                    <div className="w-28 text-right font-semibold text-fg">{formatNaira(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : (
        !error && <div className="h-64 animate-pulse rounded-[20px] bg-panel" />
      )}
    </Page>
  );
}

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

/** Leaderboard (handoff screen 11): agents in your state. */
export function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetchLeaderboard(period).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Could not load the leaderboard."),
    );
  }, [period]);

  return (
    <Page>
      <PageHeader
        title="Leaderboard"
        sub={data?.state ? `Agents in ${data.state}, by customers, upgrades and merchants.` : "Agents in your state."}
        right={<Chips<LeaderboardPeriod> options={PERIODS} value={period} onChange={setPeriod} />}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {data === null ? (
        !error && <div className="h-64 animate-pulse rounded-[20px] bg-panel" />
      ) : data.rows.length === 0 ? (
        <Empty>No agents to rank yet.</Empty>
      ) : (
        <Panel className="overflow-x-auto !p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[.06em] text-faint">
                <th className="px-5 py-3 font-semibold">Rank</th>
                <th className="py-3 font-semibold">Agent</th>
                <th className="py-3 font-semibold">Hub</th>
                <th className="py-3 text-right font-semibold">Customers</th>
                <th className="py-3 text-right font-semibold">Upgrades</th>
                <th className="px-5 py-3 text-right font-semibold">Merchants</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id} className={`border-t border-line ${r.me ? "bg-brand-soft" : ""}`}>
                  <td className="px-5 py-3">
                    {i < 3 ? (
                      <span className="inline-flex items-center gap-1 font-bold" style={{ color: MEDALS[i] }}>
                        <Medal size={16} /> {i + 1}
                      </span>
                    ) : (
                      <span className="font-semibold text-muted">{i + 1}</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-fg">{initials(r.name)}</span>
                      <span className={`font-semibold ${r.me ? "text-brand-text" : "text-fg"}`}>
                        {r.name}
                        {r.me ? " (you)" : ""}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 text-muted">{r.hub ?? "—"}</td>
                  <td className="py-3 text-right text-fg">{r.customers}</td>
                  <td className="py-3 text-right text-fg">{r.upgrades}</td>
                  <td className="px-5 py-3 text-right text-fg">{r.merchants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Page>
  );
}
