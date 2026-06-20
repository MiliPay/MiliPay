import { NavLink, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, UserPlus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { ROUTES } from "@/lib/constants";

const itemClasses = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 ${isActive ? "text-signal-bright" : "text-ink-faint"}`;

export function MobileNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canRegister = user?.role === "agent" || user?.role === "admin" || user?.role === "super_admin";

  function handleLogout() {
    logout();
    navigate(ROUTES.login);
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-ledger-raised border-t border-ledger-line px-6 py-3 flex justify-around">
      <NavLink to={ROUTES.dashboard} end className={itemClasses}>
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px] font-medium">Home</span>
      </NavLink>
      {canRegister && (
        <NavLink to={ROUTES.registerCustomer} className={itemClasses}>
          <UserPlus className="w-5 h-5" />
          <span className="text-[10px] font-medium">Register</span>
        </NavLink>
      )}
      <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-status-fail">
        <LogOut className="w-5 h-5" />
        <span className="text-[10px] font-medium">Log out</span>
      </button>
    </nav>
  );
}