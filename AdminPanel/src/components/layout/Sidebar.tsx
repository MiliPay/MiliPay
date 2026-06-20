import { NavLink, useNavigate } from "react-router-dom";
import { Fingerprint, LayoutGrid, LogOut, Settings, UserPlus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { ROUTES } from "@/lib/constants";

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3.5 py-2.5 rounded text-sm font-medium transition-colors ${
    isActive
      ? "bg-signal/10 text-signal-bright border border-signal/25"
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
    <aside className="hidden md:flex w-64 flex-col justify-between border-r border-ledger-line bg-ledger-raised shrink-0">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-9 px-1">
          <div className="w-9 h-9 rounded bg-signal flex items-center justify-center shrink-0">
            <Fingerprint className="w-5 h-5 text-signal-ink" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-ink text-[15px] leading-tight truncate">BioPay</p>
            <p className="text-[11px] text-signal-bright font-medium uppercase tracking-wider truncate">
              {user?.role.replace("_", " ")} console
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink to={ROUTES.dashboard} end className={navLinkClasses}>
            <LayoutGrid className="w-[18px] h-[18px]" />
            Overview
          </NavLink>
          {canRegister && (
            <NavLink to={ROUTES.registerCustomer} className={navLinkClasses}>
              <UserPlus className="w-[18px] h-[18px]" />
              Register customer
            </NavLink>
          )}
          {canManageSettings && (
            <NavLink to={ROUTES.settings} className={navLinkClasses}>
              <Settings className="w-[18px] h-[18px]" />
              Settings
            </NavLink>
          )}
        </nav>
      </div>

      <div className="p-5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded text-sm font-medium text-status-fail hover:bg-status-fail/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-fail focus-visible:outline-offset-2"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Log out
        </button>
      </div>
    </aside>
  );
}