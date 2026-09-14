import { NavLink } from "react-router-dom";
import { LayoutGrid, UserPlus, Users, TrendingUp, Ticket, Store } from "lucide-react";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@milipay/shared/lib/constants";

const itemClasses = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 ${isActive ? "text-signal" : "text-ink-faint"}`;

export function MobileNav() {
  const { user } = useAuth();
  const canRegister = user?.role === "agent" || user?.role === "admin" || user?.role === "super_admin";
  const canManageSupport = user?.role === "admin" || user?.role === "super_admin";

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ledger-line/95 backdrop-blur-md border-t border-white/[0.06] px-4 py-2.5 flex justify-around">
      <NavLink to={ROUTES.dashboard} end className={itemClasses}>
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">Home</span>
      </NavLink>
      <NavLink to={ROUTES.customers} className={itemClasses}>
        <Users className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">Users</span>
      </NavLink>
      <NavLink to={ROUTES.merchants} className={itemClasses}>
        <Store className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">Merchants</span>
      </NavLink>
      <NavLink to={ROUTES.transactions} className={itemClasses}>
        <TrendingUp className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">Txns</span>
      </NavLink>
      {canManageSupport && (
        <NavLink to={ROUTES.support} className={itemClasses}>
          <Ticket className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Support</span>
        </NavLink>
      )}
      {canRegister && !canManageSupport && (
        <NavLink to={ROUTES.register} className={itemClasses}>
          <UserPlus className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Register</span>
        </NavLink>
      )}
    </nav>
  );
}