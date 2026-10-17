import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpCircle, Building2, ChevronRight, Search, Trophy, UserPlus, Wrench } from "lucide-react";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { fetchAgentHome, registrationStatus, targetProgress, type AgentHome } from "@milipay/shared/features/agent/api";
import { formatNaira, whenLabel } from "@milipay/shared/lib/utils/format";
import { AutoGrid, Empty, ErrorLine, Page, PageHeader, Panel, SectionTitle } from "./parts";

/** Agent dashboard (handoff screen 2). */

function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function TargetRing({ home }: { home: AgentHome }) {
  const p = targetProgress(home);
  const r = 52;
  const c = 2 * Math.PI * r;
  const done = home.todayRegistrations + home.todayUpgrades;
  return (
    <Panel className="flex items-center gap-5">
      <svg width="128" height="128" viewBox="0 0 128 128" className="flex-none" role="img" aria-label={`${done} of ${home.target} today`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgb(var(--brand))"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform="rotate(-90 64 64)"
        />
        <text x="64" y="62" textAnchor="middle" className="fill-fg text-[28px] font-bold">{done}</text>
        <text x="64" y="84" textAnchor="middle" className="fill-muted text-[12px]">of {home.target}</text>
      </svg>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[.06em] text-faint">Today's target</div>
        <div className="mt-1.5 text-sm text-fg">
          {home.todayRegistrations} registration{home.todayRegistrations === 1 ? "" : "s"} · {home.todayUpgrades} upgrade{home.todayUpgrades === 1 ? "" : "s"}
        </div>
        <div className="mt-1 text-[13px] text-muted">
          {done >= home.target ? "Target reached. Well done." : `${home.target - done} more to reach today's target.`}
        </div>
      </div>
    </Panel>
  );
}

export default function AgentHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [home, setHome] = useState<AgentHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgentHome().then(setHome, (e) => setError(e instanceof Error ? e.message : "Could not load your dashboard."));
  }, []);

  const first = (user?.fullName || "").split(/\s+/)[0];
  const quick = [
    { label: "Register customer", icon: UserPlus, to: AGENT_ROUTES.register },
    { label: "Upgrade to Tier 2", icon: ArrowUpCircle, to: AGENT_ROUTES.upgrade },
    { label: "Register merchant", icon: Building2, to: AGENT_ROUTES.registerMerchant },
    { label: "Find customer", icon: Search, to: AGENT_ROUTES.find },
  ];

  return (
    <Page>
      <PageHeader title={`${greeting()}${first ? `, ${first}` : ""}`} sub="Here's your day so far." />
      {error && <ErrorLine>{error}</ErrorLine>}

      {home ? (
        <AutoGrid min={300}>
          <TargetRing home={home} />
          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[.06em] text-faint">Earnings this month</div>
            <div className="mt-2 text-[32px] font-bold tracking-[-0.02em] text-brand-text">{formatNaira(home.earnings.month)}</div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
              <span>Today {formatNaira(home.earnings.today)}</span>
              <span>Waiting approval {formatNaira(home.earnings.pending)}</span>
            </div>
          </Panel>
          <Panel onClick={() => navigate(AGENT_ROUTES.leaderboard)}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[.06em] text-faint">Your rank this month</div>
              <Trophy size={18} className="text-warn" />
            </div>
            <div className="mt-2 text-[32px] font-bold tracking-[-0.02em] text-fg">
              {home.rank.position ? `#${home.rank.position}` : "—"}
            </div>
            <div className="mt-1 text-[13px] text-muted">
              {home.rank.position
                ? `of ${home.rank.total} agent${home.rank.total === 1 ? "" : "s"}${home.rank.state ? ` in ${home.rank.state}` : ""}`
                : "Your state isn't set yet. Ask your supervisor."}
            </div>
          </Panel>
        </AutoGrid>
      ) : (
        !error && <div className="h-40 animate-pulse rounded-[20px] bg-panel" />
      )}

      <AutoGrid min={200}>
        {quick.map((q) => (
          <Panel key={q.to} onClick={() => navigate(q.to)} className="flex items-center gap-3 !p-4">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-soft text-brand-text">
              <q.icon size={20} />
            </span>
            <span className="text-sm font-semibold text-fg">{q.label}</span>
          </Panel>
        ))}
      </AutoGrid>

      {home && (
        <AutoGrid min={380}>
          <Panel>
            <SectionTitle>Needs your attention</SectionTitle>
            {home.declined.length === 0 && home.tier1Nearby.length === 0 ? (
              <Empty>Nothing needs you right now.</Empty>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {home.declined.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-fg">{d.name}</div>
                      <div className="truncate text-[13px] text-fail">{d.reason || "Declined. See the note from admin."}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`${AGENT_ROUTES.registrations}?tab=fix&id=${d.id}`)}
                      className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-fg hover:bg-hover"
                    >
                      <Wrench size={14} /> Fix
                    </button>
                  </div>
                ))}
                {home.tier1Nearby.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-fg">{n.name}</div>
                      <div className="truncate text-[13px] text-muted">
                        Tier 1 · •••• {n.phoneLast4}
                        {n.lga ? ` · ${n.lga}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`${AGENT_ROUTES.upgrade}?customer=${n.id}`)}
                      className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-ink"
                    >
                      <ArrowUpCircle size={14} /> Upgrade
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <SectionTitle
              right={
                <button type="button" onClick={() => navigate(AGENT_ROUTES.registrations)} className="flex items-center text-[13px] font-semibold text-brand-text">
                  See all <ChevronRight size={14} />
                </button>
              }
            >
              Recent registrations
            </SectionTitle>
            {home.recent.length === 0 ? (
              <Empty>No registrations yet. Register your first customer.</Empty>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {home.recent.map((r) => {
                  const [label, tone] = registrationStatus(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`${AGENT_ROUTES.registrations}?id=${r.id}`)}
                      className="flex items-center gap-3 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-fg">{r.name}</div>
                        <div className="text-[13px] text-muted">Tier {r.tier} · {whenLabel(r.createdAt)}</div>
                      </div>
                      <Pill tone={tone}>{label}</Pill>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </AutoGrid>
      )}
    </Page>
  );
}
