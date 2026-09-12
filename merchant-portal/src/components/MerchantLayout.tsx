import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Cpu,
  Settings,
  LogOut,
  Building2,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { LogoutModal } from "@milipay/shared/components/layout/LogoutModal";

export function MerchantLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { name: "Store Overview", path: "/dashboard", icon: LayoutDashboard },
    { name: "Live Transactions", path: "/transactions", icon: Receipt },
    { name: "POS Terminals", path: "/terminals", icon: Cpu },
    { name: "Settlement & Settings", path: "/settings", icon: Settings },
  ];

  const handleConfirmLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-ledger text-ink font-sans overflow-hidden">
      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-ledger-line border-b border-white/[0.05] z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-28 -ml-1">
            <img src="/main.png" alt="MiliPay" className="absolute top-1/2 -translate-y-1/2 left-0 h-20 w-auto object-contain scale-110 origin-left" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-status-ok/15 text-status-ok border border-status-ok/25">
            Merchant
          </span>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg bg-white/[0.04] text-ink hover:text-white"
          aria-label="Toggle Navigation"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Dropdown Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bg-ledger-raised border-b border-white/[0.08] p-4 space-y-2 z-40 shadow-2xl animate-rise-in">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium",
                  isActive
                    ? "bg-signal/10 text-signal border border-signal/20 font-semibold"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-xs text-ink-muted truncate">{user?.fullName}</span>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsLogoutModalOpen(true);
              }}
              className="text-xs text-status-fail flex items-center gap-1 font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-white/[0.05] bg-ledger-line flex-col shrink-0">
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-7 mt-2 relative h-10 w-full -ml-2">
            <div className="relative h-10 w-32">
              <img src="/main.png" alt="MiliPay Merchant" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-status-ok/15 text-status-ok border border-status-ok/25 shrink-0 mr-2">
              Merchant
            </span>
          </div>

          <div className="mt-4 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-status-ok animate-pulse" />
            <span className="text-ink-muted text-[11px] font-mono">Store Rails Active</span>
            <span className="ml-auto text-[10px] bg-status-ok/10 text-status-ok px-1.5 py-0.2 rounded font-mono font-semibold">
              LIVE
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-3">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm",
                  isActive
                    ? "bg-signal/10 text-signal border border-signal/20 font-semibold"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-white/[0.05] space-y-2">
          {user && (
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center text-signal shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {user.fullName}
                </div>
                <div className="text-[10px] text-ink-muted font-mono truncate">
                  {user.email}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-ink-muted hover:text-status-fail hover:bg-status-fail/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-ledger">
        <Outlet />
      </main>

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
