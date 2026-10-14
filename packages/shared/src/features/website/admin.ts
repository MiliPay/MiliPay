import { supabase } from "@milipay/shared/lib/supabase";
import type { Tone } from "@milipay/shared/components/ui/StatusBadge";

/**
 * What the marketing website collects (20261014110000_website_admin): merchant
 * terminal applications, agent applications, the app waitlist, and the
 * agent locations "Find an agent" shows. The reads, the audited actions, and
 * the rules for showing them.
 */

/** The admin console's Website pages. */
export const WEBSITE_ROUTES = {
  leads: "/dashboard/website/leads",
  waitlist: "/dashboard/website/waitlist",
  agents: "/dashboard/website/agents",
} as const;

export type LeadKind = "merchants" | "agents";
export type MerchantLeadStatus = "new" | "contacted" | "approved" | "declined";
export type AgentApplicationStatus = "new" | "contacted" | "trained" | "declined";
export type LeadStatus = MerchantLeadStatus | AgentApplicationStatus;

interface LeadFollowUp {
  id: string;
  phone: string;
  email: string;
  state: string;
  createdAt: string;
  statusNote: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
}

export interface MerchantLead extends LeadFollowUp {
  businessName: string;
  cac: string;
  businessType: string;
  contactName: string;
  tills: string;
  settlementBank: string;
  status: MerchantLeadStatus;
}

export interface AgentApplication extends LeadFollowUp {
  fullName: string;
  area: string;
  workplace: string;
  status: AgentApplicationStatus;
}

export interface LeadList<S extends string, R> {
  counts: Record<"all" | S, number>;
  rows: R[];
}

export interface WebsiteSummary {
  newMerchantLeads: number;
  newAgentApplications: number;
  waitlist: number;
  activeLocations: number;
}

export interface WaitlistRow {
  id: string;
  phone: string;
  page: string | null;
  createdAt: string;
  notifiedAt: string | null;
}

export interface WaitlistPage {
  total: number;
  today: number;
  notified: number;
  matching: number;
  rows: WaitlistRow[];
}

export interface AgentLocation {
  id: string;
  name: string;
  address: string;
  state: string;
  hours: string | null;
  active: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLocationList {
  states: Record<string, { active: number; inactive: number }>;
  rows: AgentLocation[];
}

const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchWebsiteSummary = () => rpc<WebsiteSummary>("admin_website_summary");

export const fetchMerchantLeads = (status: "all" | MerchantLeadStatus, q: string) =>
  rpc<LeadList<MerchantLeadStatus, MerchantLead>>("admin_merchant_leads", { p_status: status, p_q: q });

export const fetchAgentApplications = (status: "all" | AgentApplicationStatus, q: string) =>
  rpc<LeadList<AgentApplicationStatus, AgentApplication>>("admin_agent_applications", { p_status: status, p_q: q });

export const setLeadStatus = (kind: LeadKind, id: string, status: LeadStatus, note: string) =>
  rpc<{ success: true }>(kind === "merchants" ? "admin_set_merchant_lead_status" : "admin_set_agent_application_status", {
    p_id: id,
    p_status: status,
    p_note: note,
  });

export const WAITLIST_PAGE = 100;

export const fetchWaitlist = (q: string, offset = 0) =>
  rpc<WaitlistPage>("admin_waitlist", { p_q: q, p_limit: WAITLIST_PAGE, p_offset: offset });

/** Every number on the waitlist. The server records the export on the audit log. */
export const exportWaitlist = () =>
  rpc<{ rows: Omit<WaitlistRow, "id">[] }>("admin_export_waitlist").then((r) => r.rows);

export const fetchAgentLocations = () => rpc<AgentLocationList>("admin_agent_locations", { p_state: null });

export interface LocationInput {
  name: string;
  address: string;
  state: string;
  hours: string;
}

export const saveAgentLocation = (id: string | null, v: LocationInput) =>
  rpc<{ success: true; id: string }>("admin_save_agent_location", {
    p_id: id,
    p_name: v.name,
    p_address: v.address,
    p_state: v.state,
    p_hours: v.hours,
  });

export const setAgentLocationActive = (id: string, active: boolean, reason: string) =>
  rpc<{ success: true }>("admin_set_agent_location_active", { p_id: id, p_active: active, p_reason: reason });

export const reorderAgentLocations = (state: string, ids: string[]) =>
  rpc<{ success: true }>("admin_reorder_agent_locations", { p_state: state, p_ids: ids });

// ── Presentation ─────────────────────────────────────────────────────────

/** The same list as ALL_STATES in supabase/functions/_shared/website.ts (a test keeps them equal). */
export const WEBSITE_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

export const MERCHANT_LEAD_STATUS: Record<MerchantLeadStatus, [string, Tone]> = {
  new: ["New", "info"],
  contacted: ["Contacted", "warn"],
  approved: ["Approved", "ok"],
  declined: ["Declined", "muted"],
};

export const AGENT_APPLICATION_STATUS: Record<AgentApplicationStatus, [string, Tone]> = {
  new: ["New", "info"],
  contacted: ["Contacted", "warn"],
  trained: ["Trained", "ok"],
  declined: ["Declined", "muted"],
};

export const leadStatusStyle = (kind: LeadKind, status: LeadStatus): [string, Tone] =>
  (kind === "merchants"
    ? MERCHANT_LEAD_STATUS[status as MerchantLeadStatus]
    : AGENT_APPLICATION_STATUS[status as AgentApplicationStatus]) ?? [status, "muted"];

/** The statuses a lead can be moved to from where it is, in the order the drawer offers them. */
export function nextStatuses(kind: LeadKind, status: LeadStatus): LeadStatus[] {
  const all: LeadStatus[] = kind === "merchants" ? ["contacted", "approved", "declined", "new"] : ["contacted", "trained", "declined", "new"];
  return all.filter((s) => s !== status);
}

/** The verb on a status button: "Mark contacted", "Approve", "Decline", "Reopen". */
export function statusActionLabel(status: LeadStatus): string {
  switch (status) {
    case "contacted":
      return "Mark contacted";
    case "approved":
      return "Approve";
    case "trained":
      return "Mark trained";
    case "declined":
      return "Decline";
    default:
      return "Reopen";
  }
}

/** "08031234567" → "0803 123 4567"; anything else is shown as stored. */
export function formatLocalPhone(phone: string): string {
  return /^0\d{10}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

/** "08031234567" → "+2348031234567", for a tel: link or an SMS tool. */
export function internationalPhone(phone: string): string {
  return /^0\d{10}$/.test(phone) ? `+234${phone.slice(1)}` : phone;
}

/** Which website page someone joined the waitlist from. */
export function waitlistPageLabel(page: string | null): string {
  if (!page) return "Unknown";
  const p = page.replace(/^\/+/, "").split(/[?#]/)[0];
  if (p === "" || p === "home") return "Home";
  return p.charAt(0).toUpperCase() + p.slice(1).replace(/[-_/]+/g, " ");
}

/** A CSV cell: always quoted, quotes doubled, and a leading = + - @ defused so a spreadsheet doesn't run it. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Phones go out spaced ("0803 123 4567"): a bare 08031234567 is read as a
 * number by Excel and Sheets, which drop the leading 0. With spaces it stays text.
 */
export function waitlistCsv(rows: Omit<WaitlistRow, "id">[]): string {
  const head = ["Phone", "Joined from", "Joined (UTC)", "Launch SMS sent (UTC)"];
  const body = rows.map((r) => [formatLocalPhone(r.phone), waitlistPageLabel(r.page), r.createdAt, r.notifiedAt ?? ""]);
  return [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** One state's locations as the website lists them: by position, then name. */
export function locationsInState(rows: AgentLocation[], state: string): AgentLocation[] {
  return rows
    .filter((r) => r.state === state)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** The ids with the one at `index` moved up (-1) or down (+1); unchanged at either end. */
export function moveId(ids: string[], index: number, dir: -1 | 1): string[] {
  const to = index + dir;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Problems with a location form, by field; empty when it can be saved. Mirrors admin_save_agent_location. */
export function locationErrors(v: LocationInput): Partial<Record<keyof LocationInput, string>> {
  const e: Partial<Record<keyof LocationInput, string>> = {};
  const name = v.name.trim();
  const address = v.address.trim();
  if (name.length < 2 || name.length > 120) e.name = "Give the shop a name (up to 120 characters).";
  if (address.length < 5 || address.length > 300) e.address = "Give the full address (up to 300 characters).";
  if (!(WEBSITE_STATES as readonly string[]).includes(v.state)) e.state = "Choose a state.";
  if (v.hours.trim().length > 120) e.hours = "Opening hours are up to 120 characters.";
  return e;
}
