import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Users,
  TrendingUp,
  UserPlus,
  Shield,
  Ticket,
  Settings,
  Store,
  Cpu,
  Activity,
  ScanFace,
} from "lucide-react";
import { Sidebar } from "@milipay/shared/components/layout/Sidebar";
import { MobileNav } from "@milipay/shared/components/layout/MobileNav";
import { MobileHeader, type MobileNavItem } from "@milipay/shared/components/layout/MobileHeader";
import { LogoutModal } from "@milipay/shared/components/layout/LogoutModal";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@milipay/shared/lib/constants";

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const navItems: MobileNavItem[] = [
    { name: "Dashboard", path: ROUTES.dashboard, icon: LayoutGrid, end: true },
    { name: "Customers", path: ROUTES.customers, icon: Users },
    { name: "Sign-up reviews", path: ROUTES.signupReviews, icon: ScanFace },
    { name: "Merchants", path: ROUTES.merchants, icon: Store },
    { name: "POS terminals", path: ROUTES.terminals, icon: Cpu },
    { name: "Transactions", path: ROUTES.transactions, icon: TrendingUp },
    { name: "Operations", path: ROUTES.operations, icon: Activity },
    { name: "Register", path: ROUTES.register, icon: UserPlus },
    { name: "Staff", path: ROUTES.staff, icon: Shield },
    { name: "Support", path: ROUTES.support, icon: Ticket },
    { name: "Settings", path: ROUTES.settings, icon: Settings },
  ];

  const handleConfirmLogout = async () => {
    await logout();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-ledger">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <MobileHeader
          portalName="Admin"
          portalBadge="Admin"
          navItems={navItems}
          user={user}
          onLogout={() => setIsLogoutModalOpen(true)}
        />
        <main className="flex-1 min-w-0 overflow-y-auto pb-24 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        portalName="Admin Panel"
        user={user}
      />
    </div>
  );
}