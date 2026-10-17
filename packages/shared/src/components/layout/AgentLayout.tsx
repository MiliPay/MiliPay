import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpCircle, LayoutDashboard, ListChecks, Search, Store, Trophy, UserPlus, Wallet, Building2 } from "lucide-react";
import { AppShell, type NavGroup } from "@milipay/shared/components/layout/AppShell";

/**
 * The agent portal's shell (agent-portal/design_handoff_agent): the shared
 * AppShell with the agent's nav (Work / Records / Performance) and a header
 * search that goes to Find customer on Enter.
 */

export const AGENT_ROUTES = {
  dashboard: "/dashboard",
  find: "/find",
  register: "/register",
  upgrade: "/upgrade",
  registerMerchant: "/merchants/register",
  registrations: "/registrations",
  merchants: "/merchants",
  earnings: "/earnings",
  leaderboard: "/leaderboard",
} as const;

const NAV: NavGroup[] = [
  {
    title: "Work",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, to: AGENT_ROUTES.dashboard, end: true },
      { label: "Find customer", icon: Search, to: AGENT_ROUTES.find },
      { label: "Register customer", icon: UserPlus, to: AGENT_ROUTES.register },
      { label: "Upgrade to Tier 2", icon: ArrowUpCircle, to: AGENT_ROUTES.upgrade },
      { label: "Register merchant", icon: Building2, to: AGENT_ROUTES.registerMerchant },
    ],
  },
  {
    title: "Records",
    items: [
      { label: "My registrations", icon: ListChecks, to: AGENT_ROUTES.registrations },
      { label: "Merchants", icon: Store, to: AGENT_ROUTES.merchants, alsoActive: ["/merchants/"] },
    ],
  },
  {
    title: "Performance",
    items: [
      { label: "Earnings", icon: Wallet, to: AGENT_ROUTES.earnings },
      { label: "Leaderboard", icon: Trophy, to: AGENT_ROUTES.leaderboard },
    ],
  },
];

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-line bg-panel px-3"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`${AGENT_ROUTES.find}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a customer by phone, NIN last 4 or name"
        aria-label="Find a customer"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
      />
    </form>
  );
}

export function AgentLayout() {
  return <AppShell portal="agent" nav={NAV} header={<HeaderSearch />} />;
}
