import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Inbox, LayoutDashboard, Search, Users } from "lucide-react";
import { AppShell, type NavGroup } from "@milipay/shared/components/layout/AppShell";
import { supabase } from "@milipay/shared/lib/supabase";

// First match wins, so the longer paths come first.
const TITLES: [string, string][] = [
  ["/dashboard/customers/", "Customer"],
  ["/dashboard/customers", "Customers"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard", "Dashboard"],
  ["/settings", "Settings"],
  ["/complaints", "Complaints desk"],
  ["/cases", "Complaints desk"],
  ["/customers/", "Customer"],
  ["/customers", "Customers"],
  ["/calls", "Call log"],
  ["/replies", "Saved replies"],
];

/** New tickets nobody has picked up yet: the Complaints desk badge. */
function useUnassignedCount(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const { count, error } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved")
        .is("assigned_to", null);
      if (live) setN(error ? null : count ?? 0);
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return n;
}

/** The support portal: the shared shell with the support navigation. */
export function ServiceLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const unassigned = useUnassignedCount();
  const title = TITLES.find(([p]) => pathname === p || pathname.startsWith(p))?.[1] ?? "";

  // "/" jumps to customer search from anywhere except a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigate("/customers");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const nav: NavGroup[] = [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", end: true }] },
    {
      title: "Tickets",
      items: [{ label: "Complaints desk", icon: Inbox, to: "/complaints", alsoActive: ["/cases"], badge: unassigned, badgeTone: "fail" }],
    },
    { title: "Lookup", items: [{ label: "Customers", icon: Users, to: "/customers", alsoActive: ["/dashboard/customers"] }] },
  ];

  return (
    <AppShell
      portal="support"
      nav={nav}
      header={
        <>
          <div className="flex-none whitespace-nowrap text-base font-bold">{title}</div>
          <Link
            to="/customers"
            className="ml-[18px] hidden h-9 min-w-[220px] flex-[0_1_380px] items-center gap-2.5 rounded-[10px] border border-line bg-field px-3 text-faint sm:flex"
          >
            <Search size={15} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Find a customer by phone, NIN or name</span>
            <span className="rounded-[5px] border border-line px-1.5 py-px text-[11px] font-semibold text-muted">/</span>
          </Link>
          <div className="flex-1" />
        </>
      }
    />
  );
}
