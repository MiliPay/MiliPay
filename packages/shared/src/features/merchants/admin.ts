import { supabase } from "@milipay/shared/lib/supabase";
import type { Tone } from "@milipay/shared/components/ui/StatusBadge";

/**
 * Merchants, a merchant's page and POS terminals (design handoff, admin
 * "Merchants" / "Terminals"): the reads (staff_merchants,
 * staff_merchant_detail, admin_terminals), the audited actions, and the rules
 * for showing them.
 */

export type MerchantFilter = "all" | "active" | "pending" | "suspended";
export type MerchantStatusName = "active" | "pending" | "suspended" | "blacklisted";
export type TerminalState = "online" | "offline" | "inactive";
export type TerminalTab = "all" | TerminalState;

export interface MerchantRow {
  id: string;
  name: string;
  category: string;
  state: string;
  status: MerchantStatusName;
  fee: number;
  schedule: string;
  createdAt: string;
  terminals: number;
  online: number;
  offline: number;
  volume: number;
}

export interface MerchantList {
  stats: { active: number; volume: number; fees: number; pending: number };
  rows: MerchantRow[];
}

export interface MerchantTerminal {
  id: string;
  tid: string;
  model: string;
  serial: string;
  active: boolean;
  lastHeartbeat: string | null;
  state: TerminalState;
  txnsToday: number;
  volumeToday: number;
}

export interface MerchantDetail {
  id: string;
  name: string;
  category: string;
  address: string;
  state: string;
  cac: string | null;
  status: MerchantStatusName;
  director: string;
  directorPhone: string | null;
  bvnLast4: string | null;
  email: string | null;
  hasLogin: boolean;
  bank: string;
  accountNumber: string;
  accountName: string;
  accountNameChecked: boolean;
  schedule: string;
  fee: number;
  monoSubaccount: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  onboardedBy: { name: string | null; role: string | null } | null;
  volume: number;
  fees: number;
  paymentsToday: number;
  terminals: MerchantTerminal[];
}

export interface TerminalRow extends MerchantTerminal {
  merchantId: string;
  merchant: string | null;
}

export interface TerminalList {
  counts: Record<TerminalTab, number>;
  paymentsToday: number;
  /** Terminals not at a merchant yet (Agent stock). */
  stock?: number;
  rows: TerminalRow[];
}

/** A terminal not yet at a merchant: in the warehouse or an agent's bag. */
export interface StockRow {
  id: string;
  tid: string;
  model: string | null;
  serial: string | null;
  active: boolean;
  /** Given to the agent, or added to the warehouse. */
  since: string;
  heldBy: { id: string; name: string; state: string | null } | null;
}

export interface StockAgent {
  id: string;
  name: string;
  state: string | null;
  holding: number;
}

export interface StockList {
  rows: StockRow[];
  agents: StockAgent[];
}

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchMerchantList = (status: MerchantFilter, q: string) =>
  rpc<MerchantList>("staff_merchants", { p_status: status, p_q: q });

export const fetchMerchantDetail = (id: string) => rpc<MerchantDetail | null>("staff_merchant_detail", { p_id: id });

export const fetchTerminalList = (tab: TerminalTab) => rpc<TerminalList>("admin_terminals", { p_tab: tab });

export type MerchantAction = "approve" | "suspend" | "reactivate" | "fee";

export const merchantAction = (id: string, action: MerchantAction, reason: string, fee?: number) =>
  rpc<{ success: true }>("admin_merchant_action", { p_id: id, p_action: action, p_reason: reason, p_fee: fee ?? null });

export const setTerminalActive = (id: string, active: boolean, reason: string) =>
  rpc<{ success: true }>("admin_set_terminal_active", { p_id: id, p_active: active, p_reason: reason });

export const addTerminal = (merchantId: string, tid: string, serial: string, model: string) =>
  rpc<{ success: true; id: string; tid: string }>("admin_add_terminal", {
    p_merchant: merchantId,
    p_tid: tid,
    p_serial: serial,
    p_model: model,
  });

// ── Agent stock (20261017110000_admin_terminal_stock) ─────────────────────

export const fetchStock = () => rpc<StockList>("admin_stock", {});

/** Add a new terminal to stock, given straight to an agent or kept in the warehouse (agent null). */
export const addStockTerminal = (tid: string, serial: string, model: string, agentId: string | null) =>
  rpc<{ success: true; id: string; tid: string; heldBy: string }>("admin_stock_add", {
    p_tid: tid,
    p_serial: serial,
    p_model: model,
    p_agent: agentId,
  });

/** Give a terminal to an agent, move it to another, or take it back (agent null). Audited with the reason. */
export const moveStockTerminal = (terminalId: string, agentId: string | null, reason: string) =>
  rpc<{ success: true; tid: string; heldBy: string }>("admin_stock_move", { p_terminal: terminalId, p_agent: agentId, p_reason: reason });

/** Stock by holder, warehouse first: what the page's summary chips show. */
export function stockByHolder(rows: StockRow[]): { id: string | null; name: string; count: number }[] {
  const map = new Map<string | null, { id: string | null; name: string; count: number }>();
  for (const r of rows) {
    const key = r.heldBy?.id ?? null;
    const cur = map.get(key) ?? { id: key, name: r.heldBy?.name ?? "Warehouse", count: 0 };
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : b.count - a.count || a.name.localeCompare(b.name)));
}

// ── Presentation ─────────────────────────────────────────────────────────

/** The design's categories: label, lucide icon name, and tint. */
export const CATEGORY_STYLE: Record<string, { label: string; icon: string; color: string }> = {
  supermarket: { label: "Supermarket", icon: "shopping-cart", color: "#10B981" },
  dining: { label: "Dining", icon: "utensils", color: "#F97316" },
  pharmacy: { label: "Pharmacy", icon: "pill", color: "#3B82F6" },
  fuel: { label: "Fuel", icon: "fuel", color: "#EAB308" },
  retail: { label: "Retail", icon: "shopping-bag", color: "#A855F7" },
  services: { label: "Services", icon: "briefcase", color: "#64748B" },
  other: { label: "Other", icon: "store", color: "#64748B" },
};

export const categoryStyle = (c: string) => CATEGORY_STYLE[c] ?? CATEGORY_STYLE.other;

export const MERCHANT_STATUS: Record<MerchantStatusName, [string, Tone]> = {
  active: ["Active", "ok"],
  pending: ["Pending", "warn"],
  suspended: ["Suspended", "fail"],
  blacklisted: ["Blacklisted", "fail"],
};

export const TERMINAL_STATUS: Record<TerminalState, [string, Tone]> = {
  online: ["Online", "ok"],
  offline: ["Offline", "fail"],
  inactive: ["Deactivated", "muted"],
};

export const scheduleLabel = (s: string) => (s === "daily_eod" ? "Daily (EOD)" : "Instant");

export const feeLabel = (fee: number) => `${Number(fee).toFixed(1)}%`;

/** "Just now", "4 min ago", "3 days ago", or "Never" for a terminal not yet heard from. */
export function heartbeatLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const m = Math.max(0, (now - Date.parse(iso)) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(m / 1440);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "2 mo ago", "Today", "5 days ago": how long a merchant has been with us. */
export function onboardedLabel(iso: string, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? "" : "s"} ago`;
}

/** The merchant's page in whichever portal the list is showing in. */
export function merchantPath(pathname: string, id: string): string {
  return pathname.startsWith("/dashboard/") ? `/dashboard/merchants/${id}` : `/merchants/${id}`;
}

/** The register-merchant page in whichever portal we are in. */
export function registerMerchantPath(pathname: string): string {
  return pathname.startsWith("/dashboard/") ? "/dashboard/register/merchant" : "/merchants/register";
}

/** Which actions a merchant's page offers: by status, and only to admins. */
export function merchantActions(status: MerchantStatusName, isAdmin: boolean): ("approve" | "fee" | "suspend" | "reactivate")[] {
  if (!isAdmin) return [];
  if (status === "pending") return ["approve", "fee"];
  if (status === "active") return ["fee", "suspend"];
  if (status === "suspended") return ["reactivate"];
  return [];
}

export const FEE_CHOICES = ["1.0%", "1.2%", "1.5%", "2.0%"];
