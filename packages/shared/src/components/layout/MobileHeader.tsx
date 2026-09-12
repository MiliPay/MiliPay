import { useState, useEffect, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, LogOut, UserCheck } from "lucide-react";
import clsx from "clsx";

export interface MobileNavItem {
  name: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

interface MobileHeaderProps {
  portalName: string;
  portalBadge?: string;
  navItems: MobileNavItem[];
  user?: {
    fullName?: string;
    role?: string;
  } | null;
  onLogout: () => void;
}

export function MobileHeader({
  portalName,
  portalBadge,
  navItems,
  user,
  onLogout,
}: MobileHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Lock body scroll and listen to ESC key when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-30 flex md:hidden items-center justify-between px-4 py-3 bg-ledger-line/95 backdrop-blur-md border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-28 -ml-1">
            <img src="/main.png" alt="MiliPay" className="absolute top-1/2 -translate-y-1/2 left-0 h-20 w-auto object-contain scale-110 origin-left" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-signal/15 text-signal border border-signal/20">
            {portalBadge || portalName}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="Open navigation menu"
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-white/[0.05] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Slide-over Drawer Backdrop & Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <div
            className="relative w-72 max-w-[82vw] h-full bg-ledger border-r border-white/[0.08] flex flex-col justify-between z-10 shadow-2xl animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={`${portalName} Navigation Menu`}
          >
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-signal flex items-center justify-center font-display font-bold text-ledger text-sm shadow-[0_0_12px_rgba(var(--color-signal),0.35)]">
                    M
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-ink text-sm leading-none">MiliPay</h2>
                    <span className="text-[10px] text-ink-muted font-medium capitalize">
                      {portalName} Portal
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-white/[0.05] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Items */}
              <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-190px)]">
                {navItems.map((item) => {
                  const isActive = item.end
                    ? location.pathname === item.path
                    : location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));

                  const IconComponent = item.icon;

                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-signal/15 text-signal border border-signal/25 font-semibold"
                          : "text-ink-muted border border-transparent hover:bg-white/[0.03] hover:text-ink"
                      )}
                    >
                      <IconComponent className="w-4 h-4 shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User Profile & Logout */}
            <div className="p-4 border-t border-white/[0.06] space-y-3 bg-white/[0.01]">
              {user && (
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center text-signal shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">
                      {user.fullName || "MiliPay Staff"}
                    </p>
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">
                      {user.role || "Staff"}
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-status-fail/90 hover:text-status-fail hover:bg-status-fail/10 transition-colors w-full text-left text-xs font-medium"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
