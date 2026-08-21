import { NavLink, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, UserPlus, Users, TrendingUp } from "lucide-react";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@/lib/constants";

const itemClasses = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 ${isActive ? "text-signal" : "text-ink-faint"}`;

export function MobileNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canRegister = user?.role === "agent" || user?.role === "admin" || user?.role === "super_admin";

  function handleLogout() {
    logout();
    navigate(ROUTES.login);
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-ledger-line border-t border-white/[0.05] px-4 py-3 flex justify-around">
      <NavLink to={ROUTES.dashboard} end className={itemClasses}>
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-1">Home</span>
      </NavLink>
      <NavLink to={ROUTES.customers} className={itemClasses}>
        <Users className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-1">Users</span>
      </NavLink>
      <NavLink to={ROUTES.transactions} className={itemClasses}>
        <TrendingUp className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-1">Txns</span>
      </NavLink>
      {canRegister && (
        <NavLink to={ROUTES.registerCustomer} className={itemClasses}>
          <UserPlus className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Register</span>
        </NavLink>
      )}
      <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-status-fail">
        <LogOut className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-1">Log out</span>
      </button>
    </nav>
  );
}