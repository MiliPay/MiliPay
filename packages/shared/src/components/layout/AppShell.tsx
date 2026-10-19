import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LogOut, Menu, Moon, Sun, User, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { useTheme, type Portal } from "@milipay/shared/lib/theme";
import { ROUTES } from "@milipay/shared/lib/constants";
import type { Role } from "@milipay/shared/types";
import { ToastProvider } from "@milipay/shared/components/ui/Toast";
import { useIdleSignOut } from "@milipay/shared/lib/useIdleSignOut";

/**
 * The one app shell for every portal (design handoff, "One shell for every
 * portal"): a 248px sidebar with the logo row and portal badge, grouped
 * navigation, the signed-in person at the bottom with their menu, and a top
 * bar each portal fills with its own tools.
 *
 * Below 1024px the sidebar becomes a drawer behind a menu button, so the
 * portals still work on a tablet or phone.
 */

export type BadgeTone = "ok" | "warn" | "fail" | "info";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Active only on this exact path (the dashboard). */
  end?: boolean;
  /** Other paths that light this item up, e.g. a detail page. */
  alsoActive?: string[];
  badge?: number | string | null;
  badgeTone?: BadgeTone;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

const BADGE: Record<BadgeTone, string> = {
  ok: "bg-brand-soft text-brand-text",
  warn: "bg-warn-soft text-warn",
  fail: "bg-fail-soft text-fail",
  info: "bg-info-soft text-info",
};

const PORTAL: Record<Portal, { badge: string; badgeClass: string; rowHeight: string; sideClass: string }> = {
  admin: { badge: "Admin", badgeClass: "bg-chip text-muted", rowHeight: "h-16", sideClass: "bg-side" },
  support: { badge: "Support", badgeClass: "bg-info-soft text-info", rowHeight: "h-[58px]", sideClass: "bg-panel" },
  agent: { badge: "Agent", badgeClass: "bg-brand-soft text-brand-text", rowHeight: "h-16", sideClass: "bg-side" },
};

export function roleLabel(role: Role | undefined, portal: Portal): string {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "support":
      return portal === "support" ? "Support agent" : "Support";
    case "agent":
      return "Agent";
    default:
      return "";
  }
}

export function initialsOf(name: string | undefined | null): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** How closely an item matches the path (0 = not at all), so a nested route
 *  like /customers/signup-reviews lights Sign-ups, not Customers. */
function matchLength(item: NavItem, pathname: string): number {
  const paths = [item.to, ...(item.alsoActive ?? [])];
  return Math.max(
    0,
    ...paths.map((p) => (pathname === p || (!item.end && pathname.startsWith(p + "/")) ? p.length : 0)),
  );
}

export function Logo({ className = "h-7" }: { className?: string }) {
  const { theme } = useTheme();
  return (
    <img
      src={theme === "dark" ? "/brand/logo-white.png" : "/brand/logo.png"}
      alt="MiliPay"
      className={clsx("w-auto", className)}
    />
  );
}

interface AppShellProps {
  portal: Portal;
  nav: NavGroup[];
  /** The top bar's contents (search, status pills, toggles). */
  header?: ReactNode;
  /** A coloured dot on the avatar (support presence). */
  presenceColor?: string;
  /** Main area scrolls by itself (default) or leaves it to the page (inboxes). */
  mainScroll?: boolean;
  /** Runs before signing out (support goes offline first). Never blocks it. */
  onBeforeSignOut?: () => Promise<unknown> | void;
}

export function AppShell({ portal, nav, header, presenceColor, mainScroll = true, onBeforeSignOut }: AppShellProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const p = PORTAL[portal];
  const activeTo = nav
    .flatMap((g) => g.items)
    .reduce<{ to: string; n: number }>((best, item) => {
      const n = matchLength(item, pathname);
      return n > best.n ? { to: item.to, n } : best;
    }, { to: "", n: 0 }).to;

  useEffect(() => setDrawerOpen(false), [pathname]);

  const signOut = async () => {
    setMenuOpen(false);
    await Promise.resolve(onBeforeSignOut?.()).catch(() => undefined);
    await logout();
    navigate(ROUTES.login, { replace: true });
  };

  // Settings › Security: the admin and support portals sign out when idle.
  const signOutIdle = useCallback(async () => {
    await Promise.resolve(onBeforeSignOut?.()).catch(() => undefined);
    await logout();
    navigate(`${ROUTES.login}?idle=1`, { replace: true });
  }, [logout, navigate, onBeforeSignOut]);
  useIdleSignOut(Boolean(user) && (portal === "admin" || portal === "support"), signOutIdle);

  const sidebar = (
    <aside className={clsx("flex h-full flex-col border-r border-line min-h-0", p.sideClass)}>
      <div className={clsx("flex flex-none items-center gap-2.5 border-b border-line px-5", p.rowHeight)}>
        <Logo />
        <div className={clsx("ml-auto rounded-md px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[.08em]", p.badgeClass)}>
          {p.badge}
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:bg-hover lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-[18px] overflow-y-auto overflow-x-hidden px-3 py-[14px]" aria-label="Main">
        {nav.map((group, gi) => (
          <div key={group.title || gi} className="flex flex-col gap-[2px]">
            {group.title && (
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">{group.title}</div>
            )}
            {group.items.map((item) => {
              const on = item.to === activeTo;
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={clsx(
                    "flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 transition-colors duration-150 hover:bg-hover",
                    on ? "bg-brand-soft font-semibold text-brand-text" : "font-medium text-muted",
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span className="flex-1 whitespace-nowrap">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={clsx(
                        "flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11px] font-bold",
                        BADGE[item.badgeTone ?? "fail"],
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex-none border-t border-line p-3">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-hover"
        >
          <span className="relative flex-none">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[linear-gradient(145deg,#0a7a5a,#022c22)] text-xs font-bold text-[#fff]">
              {initialsOf(user?.fullName)}
            </span>
            {presenceColor && (
              <span
                className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-panel"
                style={{ background: presenceColor }}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{user?.fullName}</span>
            <span className="block text-xs text-muted">{roleLabel(user?.role, portal)}</span>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );

  return (
    <ToastProvider>
    <div className="grid h-screen grid-cols-1 overflow-hidden bg-canvas text-[14px] text-fg lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden min-h-0 lg:block">{sidebar}</div>

      {drawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full w-[248px] animate-rise-in">{sidebar}</div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-col">
        <header
          className={clsx(
            "flex flex-none items-center gap-3.5 border-b border-line bg-panel",
            portal === "support" ? "h-[58px] px-5" : "h-16 px-4 sm:px-7",
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-line text-muted hover:bg-hover lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>
          {header}
        </header>
        <main className={clsx("min-h-0 flex-1", mainScroll ? "overflow-y-auto" : "overflow-hidden")}>
          <Outlet />
        </main>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            className={clsx(
              "fixed bottom-[72px] left-3 z-[51] animate-rise-in rounded-[14px] border border-line bg-panel p-1.5 shadow-pop",
              portal === "support" ? "w-[220px]" : "w-[224px]",
            )}
          >
            {portal === "support" ? (
              <>
                <div className="px-2.5 pb-2.5 pt-2">
                  <div className="font-bold">{user?.fullName}</div>
                  <div className="text-xs text-muted">
                    {roleLabel(user?.role, portal)} · {user?.email}
                  </div>
                </div>
                <div className="mb-1 h-px bg-line" />
                <MenuItem
                  icon={User}
                  label="My profile"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                />
              </>
            ) : (
              <>
                <MenuItem
                  icon={User}
                  label="My profile"
                  onClick={() => {
                    setMenuOpen(false);
                    // The admin console shows it on the staff page; the agent
                    // portal has no staff pages, so it lives in Settings there.
                    if (portal === "admin") {
                      if (user) navigate(ROUTES.staffDetails.replace(":id", user.id));
                    } else {
                      navigate("/settings");
                    }
                  }}
                />
                <MenuItem icon={theme === "dark" ? Sun : Moon} label="Switch theme" onClick={toggleTheme} />
                <div className="my-1 h-px bg-line" />
              </>
            )}
            <MenuItem icon={LogOut} label="Sign out" danger onClick={() => void signOut()} />
          </div>
        </>
      )}
    </div>
    </ToastProvider>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "flex h-[38px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left",
        danger ? "text-fail hover:bg-fail-soft" : "hover:bg-hover",
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

/** The square 38px icon buttons in the top bar. */
export function TopBarButton({ icon: Icon, title, onClick, dot }: { icon: LucideIcon; title: string; onClick: () => void; dot?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="relative flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-line text-muted hover:bg-hover"
    >
      <Icon size={17} aria-hidden="true" />
      {dot && <span className="absolute right-2 top-[7px] h-2 w-2 rounded-full border-2 border-panel bg-fail" />}
    </button>
  );
}

/** The theme toggle in the admin top bar. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <TopBarButton icon={theme === "dark" ? Sun : Moon} title="Toggle theme" onClick={toggleTheme} />;
}
