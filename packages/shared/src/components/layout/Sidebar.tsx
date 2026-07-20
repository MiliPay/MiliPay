import { NavLink, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, Settings, UserPlus, Users, TrendingUp, Shield } from "lucide-react";
import { useAuth } from "@biopay/shared/features/auth/AuthContext";
import { ROUTES } from "@biopay/shared/lib/constants";

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
    isActive
      ? "bg-signal/10 text-signal border border-signal/20"
      : "text-ink-muted border border-transparent hover:bg-white/[0.03] hover:text-ink"
  }`;

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const canRegister = user?.role === "agent" || user?.role === "admin" || user?.role === "super_admin";
  const canManageSettings = user?.role === "admin" || user?.role === "super_admin";

  function handleLogout() {
    logout();
    navigate(ROUTES.login);
  }

  return (
    <aside className="hidden md:flex w-64 flex-col justify-between border-r border-white/[0.05] bg-ledger-line shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-9">
          <div className="w-8 h-8 rounded bg-signal flex items-center justify-center font-display font-bold text-white shadow-[0_0_15px_rgba(var(--color-signal),0.4)] shrink-0">
            A
          </div>
          <div className="min-w-0">
            <span className="font-display font-medium text-xl tracking-tight truncate">BioPay Admin</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink to={ROUTES.dashboard} end className={navLinkClasses}>
            <LayoutGrid className="w-[18px] h-[18px]" />
            Overview
          </NavLink>
          <NavLink to={ROUTES.customers} className={navLinkClasses}>
            <Users className="w-[18px] h-[18px]" />
            Customers
          </NavLink>
          <NavLink to={ROUTES.transactions} className={navLinkClasses}>
            <TrendingUp className="w-[18px] h-[18px]" />
            Transactions
          </NavLink>
          {canRegister && (
            <NavLink to={ROUTES.registerCustomer} className={navLinkClasses}>
              <UserPlus className="w-[18px] h-[18px]" />
              Register customer
            </NavLink>
          )}
          {canManageSettings && (
            <>
              <NavLink to={ROUTES.staff} className={navLinkClasses}>
                <Shield className="w-[18px] h-[18px]" />
                Team Management
              </NavLink>
              <NavLink to={ROUTES.settings} className={navLinkClasses}>
                <Settings className="w-[18px] h-[18px]" />
                Settings
              </NavLink>
            </>
          )}
        </nav>
      </div>

      <div className="p-4 border-t border-white/[0.05]">
        <button
          onClick={handleLogout}
          className="flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-ink-muted hover:text-status-warning hover:bg-status-warning/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-warning focus-visible:outline-offset-2"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Log out</span>
        </button>
      </div>
    </aside>
  );
}