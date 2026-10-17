import {
  Activity,
  ArrowLeftRight,
  Bell,
  Building2,
  Inbox,
  ListOrdered,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Shield,
  Store,
  UserPlus,
  UserRoundPlus,
  Users,
  Boxes,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppShell, ThemeToggle, TopBarButton, type NavGroup } from "@milipay/shared/components/layout/AppShell";
import { GlobalSearch } from "@milipay/shared/components/layout/GlobalSearch";
import { useAdminNavCounts } from "@milipay/shared/features/navCounts/useNavCounts";
import { ROUTES } from "@milipay/shared/lib/constants";
import { WEBSITE_ROUTES } from "@milipay/shared/features/website/admin";

/**
 * The status pill in the top bar. It says "All systems normal" only when no
 * payment is stuck with a provider or held for review; otherwise it says how
 * many are, and links to Operations. Hidden while the count is unknown.
 */
function SystemStatus({ waiting }: { waiting: number | null }) {
  if (waiting === null) return null;
  if (waiting === 0) {
    return (
      <div
        title="No payment is stuck with a provider or held for review"
        className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-text sm:flex"
      >
        <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-brand" />
        All systems normal
      </div>
    );
  }
  return (
    <Link
      to={ROUTES.operations}
      className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-warn-soft px-3 py-1.5 text-xs font-semibold text-warn sm:flex"
    >
      <span className="h-[7px] w-[7px] rounded-full bg-warn" />
      {waiting === 1 ? "1 payment needs attention" : `${waiting} payments need attention`}
    </Link>
  );
}

/** The admin console: the shared shell with the admin navigation. */
export default function DashboardLayout() {
  const counts = useAdminNavCounts();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const nav: NavGroup[] = [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, to: ROUTES.dashboard, end: true }] },
    {
      title: "Monitor",
      items: [
        { label: "Transactions", icon: ArrowLeftRight, to: ROUTES.transactions },
        { label: "Operations", icon: Activity, to: ROUTES.operations, badge: counts.operations, badgeTone: "fail" },
        { label: "Audit log", icon: ScrollText, to: ROUTES.audit },
      ],
    },
    {
      title: "Network",
      items: [
        { label: "Customers", icon: Users, to: ROUTES.customers, badge: counts.pendingCustomers, badgeTone: "warn" },
        { label: "Sign-ups", icon: UserRoundPlus, to: ROUTES.signups, badge: counts.signupReviews, badgeTone: "warn" },
        { label: "Merchants", icon: Store, to: ROUTES.merchants },
        { label: "POS terminals", icon: MonitorSmartphone, to: ROUTES.terminals, end: true, badge: counts.offlineTerminals, badgeTone: "fail" },
        { label: "Agent stock", icon: Boxes, to: ROUTES.terminalStock },
      ],
    },
    {
      title: "Register",
      items: [
        { label: "Customer", icon: UserPlus, to: ROUTES.registerCustomer },
        { label: "Merchant", icon: Building2, to: ROUTES.registerMerchant },
      ],
    },
    {
      title: "Team",
      items: [
        { label: "Staff", icon: Shield, to: ROUTES.staff },
        { label: "Support", icon: LifeBuoy, to: ROUTES.support, badge: counts.openTickets, badgeTone: "info" },
      ],
    },
    {
      title: "Website",
      items: [
        { label: "Leads", icon: Inbox, to: WEBSITE_ROUTES.leads, badge: counts.newLeads, badgeTone: "warn" },
        { label: "Waitlist", icon: ListOrdered, to: WEBSITE_ROUTES.waitlist },
        { label: "Agent locations", icon: MapPin, to: WEBSITE_ROUTES.agents },
      ],
    },
    { title: "System", items: [{ label: "Settings", icon: Settings, to: ROUTES.settings }] },
  ];

  return (
    <AppShell
      portal="admin"
      nav={nav}
      mainScroll={!pathname.startsWith(ROUTES.support)}
      header={
        <>
          <GlobalSearch />
          <div className="flex-1" />
          <SystemStatus waiting={counts.operations} />
          <ThemeToggle />
          <TopBarButton
            icon={Bell}
            title={counts.deniedToday ? `Audit log · ${counts.deniedToday} denied today` : "Audit log"}
            dot={Boolean(counts.deniedToday)}
            onClick={() => navigate(ROUTES.audit)}
          />
        </>
      }
    />
  );
}
