import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { UserPlus, History, Settings, LogOut, Users, UserCheck, Ticket } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export function AgentLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: History },
    { name: "Register Customer", path: "/register", icon: UserPlus },
    { name: "Customers", path: "/customers", icon: Users },
    { name: "Complaints", path: "/support", icon: Ticket },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-ledger text-ink font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/[0.05] bg-ledger-line flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-signal flex items-center justify-center font-display font-bold text-white shadow-[0_0_15px_rgba(var(--color-signal),0.4)]">
              B
            </div>
            <span className="font-display font-medium text-xl tracking-tight">MiliPay Agent</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-signal/10 text-signal border border-signal/20"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-white/[0.05] space-y-2">
          {user && (
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center text-signal">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{user.fullName || "Field Agent"}</p>
                <p className="text-[10px] text-ink-muted uppercase font-semibold">{user.role}</p>
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-ink-muted hover:text-status-warning hover:bg-status-warning/10 transition-colors w-full text-left text-xs font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
