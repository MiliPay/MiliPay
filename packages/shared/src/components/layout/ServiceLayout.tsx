import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Search, MessageSquareWarning, Users, LogOut, UserCheck, Settings, Inbox } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { MobileHeader, type MobileNavItem } from "@milipay/shared/components/layout/MobileHeader";
import { LogoutModal } from "@milipay/shared/components/layout/LogoutModal";

export function ServiceLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const navItems: MobileNavItem[] = [
    { name: "Search & Lookup", path: "/dashboard", icon: Search, end: true },
    { name: "Customers", path: "/customers", icon: Users },
    { name: "Complaints Desk", path: "/complaints", icon: MessageSquareWarning },
    { name: "My Cases", path: "/cases", icon: Inbox },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  const handleConfirmLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-ledger text-ink font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-white/[0.05] bg-ledger-line flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center justify-between mb-9 mt-4 relative h-10 w-full -ml-2">
            <div className="relative h-10 w-32">
              <img src="/main.png" alt="MiliPay Service" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-status-info/15 text-status-info border border-status-info/25 shrink-0 mr-2">
              Support
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== "/" && item.path !== "/dashboard" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-signal/10 text-signal border border-signal/20 font-semibold"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.05] space-y-2">
          {user && (
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center text-signal">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{user.fullName || "Support Staff"}</p>
                <p className="text-[10px] text-ink-muted uppercase font-semibold">{user.role}</p>
              </div>
            </div>
          )}
          <button 
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-ink-muted hover:text-status-warning hover:bg-status-warning/10 transition-colors w-full text-left text-xs font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <MobileHeader
          portalName="Service"
          portalBadge="Support Staff"
          navItems={navItems}
          user={user}
          onLogout={() => setIsLogoutModalOpen(true)}
        />
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        portalName="Support Service Portal"
        user={user}
      />
    </div>
  );
}
