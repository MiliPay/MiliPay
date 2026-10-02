import {
  Activity,
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  LifeBuoy,
  MonitorSmartphone,
  Settings,
  Shield,
  Store,
  UserPlus,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { AppShell, ThemeToggle, type NavGroup } from "@milipay/shared/components/layout/AppShell";
import { useAdminNavCounts } from "@milipay/shared/features/navCounts/useNavCounts";
import { ROUTES } from "@milipay/shared/lib/constants";

/** The admin console: the shared shell with the admin navigation. */
export default function DashboardLayout() {
  const counts = useAdminNavCounts();

  const nav: NavGroup[] = [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, to: ROUTES.dashboard, end: true }] },
    {
      title: "Monitor",
      items: [
        { label: "Transactions", icon: ArrowLeftRight, to: ROUTES.transactions },
        { label: "Operations", icon: Activity, to: ROUTES.operations, badge: counts.operations, badgeTone: "fail" },
      ],
    },
    {
      title: "Network",
      items: [
        { label: "Customers", icon: Users, to: ROUTES.customers, badge: counts.pendingCustomers, badgeTone: "warn" },
        { label: "Sign-ups", icon: UserRoundPlus, to: ROUTES.signupReviews, badge: counts.signupReviews, badgeTone: "warn" },
        { label: "Merchants", icon: Store, to: ROUTES.merchants },
        { label: "POS terminals", icon: MonitorSmartphone, to: ROUTES.terminals, badge: counts.offlineTerminals, badgeTone: "fail" },
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
    { title: "System", items: [{ label: "Settings", icon: Settings, to: ROUTES.settings }] },
  ];

  return (
    <AppShell
      portal="admin"
      nav={nav}
      header={
        <>
          <div className="flex-1" />
          <ThemeToggle />
        </>
      }
    />
  );
}
