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
