import {
  ArrowLeftRight,
  LifeBuoy,
  MonitorSmartphone,
  Store,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNairaWhole } from "@milipay/shared/lib/utils/format";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";

/** The admin search's results (public.admin_search), grouped for the dropdown. */

export interface Hit {
  title: string;
  sub: string;
  to: string;
}

export interface Group {
  label: string;
  icon: LucideIcon;
  items: Hit[];
}

export interface SearchResult {
  customers?: { id: string; name: string; phone: string | null; tier: number | null; status: string }[];
  signups?: { id: string; name: string; phone: string; step: string }[];
  transactions?: { id: string; reference: string; amount: number; status: string; customer: string }[];
  merchants?: { id: string; name: string; rc: string | null; state: string | null }[];
  terminals?: { id: string; terminalId: string; serial: string | null; merchant: string | null }[];
  tickets?: { id: string; ticketId: string | null; subject: string | null; status: string; customer: string }[];
}

const SIGNUP_STEP: Record<string, string> = {
  phone: "Step 1 of 5",
  nin: "Step 2 of 5",
  selfie: "Step 3 of 5",
  confirm: "Step 3 of 5",
  addr: "Step 4 of 5",
  review: "Needs review",
  done: "Account created",
  abandoned: "Abandoned",
};

const at = (route: string, id: string) => route.replace(":id", encodeURIComponent(id));

export function groupResults(r: SearchResult): Group[] {
  const groups: Group[] = [
    {
      label: "Customers",
      icon: Users,
      items: (r.customers ?? []).map((c) => ({
        title: c.name || c.phone || "Customer",
        sub: [c.phone, c.tier ? `Tier ${c.tier}` : null, c.status === "active" ? null : c.status].filter(Boolean).join(" · "),
        to: at(ROUTES.customerDetails, c.id),
      })),
    },
    {
      label: "Sign-ups",
      icon: UserRoundPlus,
      items: (r.signups ?? []).map((s) => ({
        title: s.name || s.phone,
        sub: [s.name ? s.phone : null, SIGNUP_STEP[s.step] ?? s.step].filter(Boolean).join(" · "),
        to: `${ROUTES.signups}?id=${encodeURIComponent(s.id)}`,
      })),
    },
    {
      label: "Transactions",
      icon: ArrowLeftRight,
      items: (r.transactions ?? []).map((t) => ({
        title: t.reference,
        sub: [t.customer || null, formatNairaWhole(t.amount), presentTransactionStatus(t.status).label].filter(Boolean).join(" · "),
        to: at(ROUTES.transactionDetails, t.id),
      })),
    },
    {
      label: "Merchants",
      icon: Store,
      items: (r.merchants ?? []).map((m) => ({
        title: m.name,
        sub: [m.rc, m.state].filter(Boolean).join(" · "),
        to: at(ROUTES.merchantDetails, m.id),
      })),
    },
    {
      label: "POS terminals",
      icon: MonitorSmartphone,
      items: (r.terminals ?? []).map((t) => ({
        title: t.terminalId,
        sub: [t.merchant, t.serial].filter(Boolean).join(" · "),
        to: ROUTES.terminals,
      })),
    },
    {
      label: "Tickets",
      icon: LifeBuoy,
      items: (r.tickets ?? []).map((k) => ({
        title: [k.ticketId, k.subject].filter(Boolean).join(" · "),
        sub: k.customer || "",
        to: at(ROUTES.supportDetails, k.id),
      })),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

