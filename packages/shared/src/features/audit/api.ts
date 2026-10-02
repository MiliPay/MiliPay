import { supabase } from "@milipay/shared/lib/supabase";

/**
 * The audit log (public.audit_events): append-only and hash-chained. Staff
 * actions taken in the portals are written through log_audit_event, which
 * takes the actor, IP, browser and session from the request itself.
 */

export type AuditCategory =
  | "Auth"
  | "Customers"
  | "Sign-ups"
  | "Transactions"
  | "Merchants"
  | "Terminals"
  | "Staff"
  | "Support"
  | "Settings"
  | "Alerts";

export interface AuditInput {
  category: AuditCategory;
  /** What happened, as a verb phrase: "approved customer", "refunded". */
  action: string;
  /** What it happened to, as shown: a name or a reference. */
  target?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  result?: "success" | "denied";
}

/** Record an action. Never throws: a failed write is reported as false. */
export async function logAudit(e: AuditInput): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("log_audit_event", {
      p_category: e.category,
      p_action: e.action,
      p_target: e.target ?? null,
      p_target_id: e.targetId ?? null,
      p_before: e.before ?? null,
      p_after: e.after ?? null,
      p_reason: e.reason ?? null,
      p_result: e.result ?? "success",
    });
    return !error;
  } catch {
    return false;
  }
}

// ── Reading it (Admin › Audit log) ────────────────────────────────────────

export interface AuditEvent {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  category: AuditCategory;
  action: string;
  target: string | null;
  targetId: string | null;
  result: "success" | "denied";
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  hash: string;
}

export const AUDIT_CATEGORIES: AuditCategory[] = [
  "Auth",
  "Customers",
  "Sign-ups",
  "Transactions",
  "Merchants",
  "Terminals",
  "Staff",
  "Support",
  "Settings",
  "Alerts",
];

/** Newest first, `limit` at a time; pass the last id seen to get the next page. */
export async function fetchAuditEvents(opts: {
  category?: AuditCategory | null;
  q?: string;
  actorId?: string | null;
  beforeId?: number | null;
  limit?: number;
}): Promise<AuditEvent[]> {
  let query = supabase
    .from("audit_events")
    .select("id, occurred_at, actor_id, actor_name, actor_role, category, action, target, target_id, result, reason, before, after, ip, user_agent, session_id, hash")
    .order("id", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.actorId) query = query.eq("actor_id", opts.actorId);
  if (opts.beforeId) query = query.lt("id", opts.beforeId);
  // Characters that would break PostgREST's or=() filter syntax.
  const term = (opts.q ?? "").replace(/[,()*%\\]/g, " ").trim();
  if (term) query = query.or(`actor_name.ilike.*${term}*,action.ilike.*${term}*,target.ilike.*${term}*`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    category: r.category,
    action: r.action,
    target: r.target,
    targetId: r.target_id,
    result: r.result,
    reason: r.reason,
    before: r.before,
    after: r.after,
    ip: r.ip,
    userAgent: r.user_agent,
    sessionId: r.session_id,
    hash: r.hash,
  }));
}

export interface AuditSummary {
  eventsToday: number;
  sensitiveToday: number;
  deniedToday: number;
  activeStaffToday: number;
}

export async function fetchAuditSummary(): Promise<AuditSummary> {
  const { data, error } = await supabase.rpc("admin_audit_summary");
  if (error) throw new Error(error.message);
  return data as AuditSummary;
}

/** Recompute every hash in the chain on the server. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; firstBadId: number | null }> {
  const { data, error } = await supabase.rpc("verify_audit_chain");
  if (error) throw new Error(error.message);
  return data as { ok: boolean; checked: number; firstBadId: number | null };
}

/** "Chrome · Windows" from a user-agent string. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /Deno|node|undici/i.test(ua)
              ? "Server"
              : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

/** How a role reads next to a name in the log. */
export function auditRoleLabel(role: string): string {
  return (
    { super_admin: "Super admin", admin: "Admin", support: "Support", agent: "Agent", system: "Automated" } as Record<string, string>
  )[role] ?? role;
}
