import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Inbox, LayoutDashboard, Phone, Search, Users, X, Zap } from "lucide-react";
import clsx from "clsx";
import { AppShell, type NavGroup } from "@milipay/shared/components/layout/AppShell";
import { ToastProvider, useToast } from "@milipay/shared/components/ui/Toast";
import { DeskProvider, useDesk } from "@milipay/shared/features/support/DeskContext";
import { searchPeople, type Person, type Presence } from "@milipay/shared/features/support/desk";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";
import { initials } from "@milipay/shared/lib/utils/format";

/**
 * The support portal's shell (design handoff, MiliPay Support): the shared
 * AppShell with the support navigation, and a top bar with the page title,
 * customer search, the queue's SLA summary and the agent's presence.
 */

// First match wins, so the longer paths come first.
const TITLES: [string, string][] = [
  ["/customers/", "Customer"],
  ["/customers", "Customers"],
  ["/complaints", "Complaints desk"],
  ["/cases", "Complaints desk"],
  ["/calls", "Call log"],
  ["/replies", "Saved replies"],
  ["/settings", "Settings"],
  ["/dashboard", "Dashboard"],
];

export const PRESENCE_DOT: Record<Presence, string> = { online: "#00C896", away: "#FFB454", offline: "#8A9C95" };

const PRESENCE_TOAST: Record<Presence, string> = {
  online: "You are online. New chats can be routed to you.",
  away: "Away: no new chats will be routed to you.",
  offline: "Offline",
};

/** Where a search result opens. */
export function personPath(p: Pick<Person, "kind" | "id">): string {
  return p.kind === "customer"
    ? SUPPORT_ROUTES.customerDetails.replace(":id", p.id)
    : SUPPORT_ROUTES.applicant.replace(":id", p.id);
}

function TopSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [hits, setHits] = useState<Person[]>([]);
  const [searched, setSearched] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      setSearched("");
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchPeople(term).then(
        (rows) => {
          if (!live) return;
          setHits(rows);
          setSearched(term);
        },
        () => live && setHits([]),
      );
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  // "/" jumps to the search from anywhere except a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (p: Person) => {
    setFocus(false);
    navigate(personPath(p));
  };
  const onCustomers = pathname === SUPPORT_ROUTES.customers;
  const showList = focus && q.trim() !== "" && !onCustomers;

  return (
    <div className="relative ml-[18px] hidden min-w-[220px] flex-[0_1_380px] sm:block">
      <div
        className={clsx(
          "flex h-9 items-center gap-2.5 rounded-[10px] border bg-field px-3 text-faint",
          focus ? "border-brand" : "border-line",
        )}
      >
        <Search size={15} aria-hidden="true" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setFocus(true);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (hits.length === 1) open(hits[0]);
              else {
                setFocus(false);
                navigate(`${SUPPORT_ROUTES.customers}?q=${encodeURIComponent(q.trim())}`);
              }
            }
            if (e.key === "Escape") setFocus(false);
          }}
          placeholder="Find a customer by phone, name or reference"
          aria-label="Find a customer"
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-faint"
        />
        {q && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setQ("");
            }}
            className="flex text-faint"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showList && (
        <div className="absolute left-0 right-0 top-[42px] z-40 animate-rise-in overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
          {searched === q.trim() && hits.length === 0 && (
            <div className="p-3.5 text-[13px] text-muted">No customer matches "{q.trim()}".</div>
          )}
          {hits.slice(0, 6).map((h) => (
            <button
              key={h.kind + h.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                open(h);
              }}
              className="flex w-full items-center gap-2.5 border-b border-line2 px-3 py-[9px] text-left hover:bg-hover"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-text">
                {initials(h.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{h.name}</span>
                <span className="block truncate text-xs text-muted">
                  <span className="font-mono">{h.phone}</span>
                  {h.match ?? (h.kind === "applicant" ? " · still signing up" : "")}
                </span>
              </span>
              <ArrowUpRight size={14} className="text-faint" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportShell() {
  const { pathname } = useLocation();
  const { flash } = useToast();
  const { summary, presence, changePresence } = useDesk();
  const title = TITLES.find(([p]) => pathname === p || pathname.startsWith(p))?.[1] ?? "";
  const inbox = pathname.startsWith(SUPPORT_ROUTES.complaints) || pathname.startsWith("/cases");

  const nav: NavGroup[] = [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, to: SUPPORT_ROUTES.dashboard, end: true }] },
    {
      title: "Tickets",
      items: [
        { label: "Complaints desk", icon: Inbox, to: SUPPORT_ROUTES.complaints, alsoActive: ["/cases"], badge: summary.unassigned || null, badgeTone: "fail" },
        { label: "Call log", icon: Phone, to: SUPPORT_ROUTES.calls },
        { label: "Saved replies", icon: Zap, to: SUPPORT_ROUTES.replies },
      ],
    },
    { title: "Lookup", items: [{ label: "Customers", icon: Users, to: SUPPORT_ROUTES.customers }] },
  ];

  const pick = async (p: Presence) => {
    try {
      await changePresence(p);
      flash(PRESENCE_TOAST[p]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't change your status.", "fail");
    }
  };

  const goOffline = useCallback(() => changePresence("offline"), [changePresence]);

  return (
    <AppShell
      portal="support"
      nav={nav}
      presenceColor={PRESENCE_DOT[presence]}
      mainScroll={!inbox}
      onBeforeSignOut={goOffline}
      header={
        <>
          <div className="flex-none whitespace-nowrap text-base font-bold">{title}</div>
          <TopSearch />
          <div className="flex-1" />
          <div className="hidden items-center gap-3.5 xl:flex">
            {[
              [`${summary.overdue} overdue`, summary.overdue ? "text-fail" : "text-faint"],
              [`${summary.risk} at risk`, summary.risk ? "text-warn" : "text-faint"],
              [`${summary.unassigned} new`, "text-muted"],
            ].map(([label, cls]) => (
              <div key={label} className={clsx("flex flex-none items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold", cls)}>
                <span className="h-[7px] w-[7px] rounded-full bg-current" />
                {label}
              </div>
            ))}
            <div className="h-6 w-px bg-line" />
          </div>
          <div className="flex gap-0.5 rounded-[10px] bg-chip p-[3px]" role="radiogroup" aria-label="Your status">
            {(["online", "away", "offline"] as Presence[]).map((p) => {
              const on = presence === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => void pick(p)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-[5px] text-[12.5px] font-semibold capitalize",
                    on ? "bg-panel text-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-muted",
                  )}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: PRESENCE_DOT[p] }} />
                  <span className="hidden md:inline">{p}</span>
                </button>
              );
            })}
          </div>
        </>
      }
    />
  );
}

/** The support portal: the shared shell with the support navigation. */
export function ServiceLayout() {
  return (
    // The shell's own toasts (presence) sit outside AppShell's provider.
    <ToastProvider>
      <DeskProvider>
        <SupportShell />
      </DeskProvider>
    </ToastProvider>
  );
}
