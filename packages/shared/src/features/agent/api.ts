import { supabase } from "@milipay/shared/lib/supabase";
import type { Tone } from "@milipay/shared/components/ui/StatusBadge";

/**
 * The agent portal's reads and actions (20261017090000_agent_portal and the
 * agent-upgrade Edge Function). Every RPC checks on the server that the
 * caller is an agent past their second factor; this module only shapes the
 * results for the pages.
 */

export type CustomerStatus = "active" | "pending" | "rejected" | "suspended" | string;

export interface AgentHome {
  target: number;
  todayRegistrations: number;
  todayUpgrades: number;
  earnings: { month: number; today: number; pending: number };
  rank: { position: number | null; total: number; state: string | null };
  declined: { id: string; name: string; reason: string | null; createdAt: string }[];
  tier1Nearby: { id: string; name: string; phoneLast4: string; lga: string | null; createdAt: string }[];
  recent: { id: string; name: string; status: CustomerStatus; tier: number; createdAt: string }[];
}

export interface FoundCustomer {
  id: string;
  name: string;
  phone: string;
  ninLast4: string | null;
  tier: number;
  status: CustomerStatus;
  state: string | null;
  palm: boolean;
  mine: boolean;
  source: string | null;
  reason: string | null;
}

export type RegistrationTab = "all" | "pending" | "approved" | "fix" | "upgrades";

export interface Registration {
  id: string;
  name: string;
  phone: string;
  ninLast4: string | null;
  kind: "customer" | "upgrade";
  status: CustomerStatus;
  tier: number;
  reason: string | null;
  palm: boolean;
  face: boolean;
  commission: number;
  at: string;
  approvedAt: string | null;
}

export interface Earnings {
  today: number;
  month: number;
  pending: number;
  nextPayout: string;
  breakdown: { kind: "customer" | "upgrade" | "merchant"; count: number; rate: number }[];
  payouts: { amount: number; periodStart: string; periodEnd: string; paidAt: string | null; reference: string | null }[];
}

export type LeaderboardPeriod = "today" | "week" | "month";

export interface Leaderboard {
  state: string | null;
  rows: { id: string; name: string; hub: string | null; me: boolean; customers: number; upgrades: number; merchants: number; total: number }[];
}

export interface StockTerminal {
  id: string;
  terminalId: string;
  model: string | null;
  serial: string | null;
  collectedAt: string;
}

const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchAgentHome = () => rpc<AgentHome>("agent_home");
export const findCustomers = (q: string) => rpc<FoundCustomer[]>("agent_find_customers", { p_q: q });
export const fetchRegistrations = (tab: RegistrationTab) => rpc<Registration[]>("agent_registrations", { p_tab: tab });
export const fetchEarnings = () => rpc<Earnings>("agent_earnings");
export const fetchLeaderboard = (period: LeaderboardPeriod) => rpc<Leaderboard>("agent_leaderboard", { p_period: period });
export const fetchStock = () => rpc<StockTerminal[]>("agent_stock");
export const assignTerminal = (terminalId: string, merchantId: string) =>
  rpc<{ success: true; terminalId: string; merchant: string }>("agent_assign_terminal", { p_terminal: terminalId, p_merchant: merchantId });

// ── Upgrade to Tier 2 (agent-upgrade) ───────────────────────────────────────

async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // not JSON
    }
  }
  return fallback;
}

async function upgrade<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("agent-upgrade", { body });
  if (error) throw new Error(await functionError(error, "That didn't work. Try again."));
  if (!data?.success) throw new Error(data?.error || "That didn't work. Try again.");
  return data as T;
}

export const sendUpgradeCode = (customerId: string) =>
  upgrade<{ requestId: string; sentTo: string }>({ action: "request", customerId });
export const resendUpgradeCode = (requestId: string) => upgrade<{ sentTo: string }>({ action: "resend", requestId });
export const verifyUpgradeCode = (requestId: string, code: string) => upgrade<{ success: true }>({ action: "verify", requestId, code });
export const completeUpgrade = (requestId: string, palmVeinTemplate: string, quality: number) =>
  upgrade<{ customerId: string; tier: 2; maxSingle: number; maxDaily: number }>({ action: "complete", requestId, palmVeinTemplate, quality });

/** Register customer, step 1: text a code to the customer's phone. */
export const sendPhoneCheck = (phone: string) => upgrade<{ checkId: string }>({ action: "phone_request", phone });
export const resendPhoneCheck = (checkId: string) => upgrade<{ success: true }>({ action: "phone_resend", checkId });
export const verifyPhoneCheck = (checkId: string, code: string) => upgrade<{ success: true }>({ action: "phone_verify", checkId, code });

/** "1234 567 8901": the NIN as the design shows it (4-3-4). */
export function formatNin(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
}

/** Fix and resubmit: send only what was recaptured (quality 0–100). */
export const resubmitRegistration = (
  customerId: string,
  capture: { palmVeinTemplate?: string; palmQuality?: number; faceTemplate?: string; faceQuality?: number },
) => upgrade<{ status: "pending" }>({ action: "resubmit", customerId, ...capture });

// ── Presentation ────────────────────────────────────────────────────────────

/** Commission only counts once a registration is approved (handoff). */
export const COMMISSION_LABEL: Record<"customer" | "upgrade" | "merchant", string> = {
  customer: "Approved customers",
  upgrade: "Tier 2 upgrades",
  merchant: "Approved merchants",
};

export function registrationStatus(r: { status: CustomerStatus; kind?: string }): [string, Tone] {
  if (r.kind === "upgrade") return ["Upgraded", "ok"];
  switch (r.status) {
    case "active":
      return ["Approved", "ok"];
    case "pending":
      return ["Pending review", "warn"];
    case "rejected":
      return ["Needs fixing", "fail"];
    case "suspended":
      return ["Suspended", "fail"];
    default:
      return [String(r.status), "muted"];
  }
}

/** Progress towards today's target, 0–1. */
export function targetProgress(home: Pick<AgentHome, "target" | "todayRegistrations" | "todayUpgrades">): number {
  if (home.target <= 0) return 1;
  return Math.min(1, (home.todayRegistrations + home.todayUpgrades) / home.target);
}

/** A palm or face quality score under 70 isn't good enough (handoff). */
export const QUALITY_MIN = 70;

/** "Fri 23 Oct": when the next weekly payout lands. */
export function payoutLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+01:00`);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(d);
}

export const MEDALS = ["#F5C451", "#C9D1D9", "#D08B5B"] as const;
