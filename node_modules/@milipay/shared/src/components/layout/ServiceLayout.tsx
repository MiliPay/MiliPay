import { Outlet, Link, useLocation } from "react-router-dom";
import { Search, MessageSquareWarning, Users, LogOut } from "lucide-react";
import clsx from "clsx";

export function ServiceLayout() {
  const location = useLocation();

  const navItems = [
    { name: "Search & Lookup", path: "/", icon: Search },
    { name: "Customers", path: "/customers", icon: Users },
    { name: "Complaints Desk", path: "/complaints", icon: MessageSquareWarning },
    { name: "My Cases", path: "/cases", icon: Users },
  ];

  return (
    <div className="flex h-screen bg-ledger text-ink font-sans">
      <aside className="w-64 border-r border-white/[0.05] bg-ledger-line flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-status-info flex items-center justify-center font-display font-bold text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]">
              S
            </div>
            <span className="font-display font-medium text-xl tracking-tight">MiliPay Service</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-status-info/10 text-status-info border border-status-info/20"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.05]">
          <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-ink-muted hover:text-status-warning hover:bg-status-warning/10 transition-colors w-full text-left">
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Log Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
