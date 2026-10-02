import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { Caller } from "./auth.ts";

/**
 * Write to the audit log (public.audit_events) from an Edge Function, for
 * the sensitive actions taken through one: approving or rejecting a
 * customer, deciding a sign-up, inviting staff, changing fees.
 *
 * The actor is the verified caller, looked up in staff_profiles; the IP and
 * browser come from the request. The row is chained and hashed by the
 * database. A failed write is logged and reported as false, never thrown:
 * the action itself has already happened and must not be undone by this.
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

export interface AuditEntry {
  category: AuditCategory;
  action: string;
  target?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  result?: "success" | "denied";
}

/** The claims of an already-verified JWT (for the session id). */
function sessionId(req: Request): string | null {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const sid = JSON.parse(atob(b64)).session_id;
    return typeof sid === "string" ? sid : null;
  } catch {
    return null;
  }
}

export async function recordAudit(
  admin: SupabaseClient,
  req: Request,
  caller: Caller,
  entry: AuditEntry,
): Promise<boolean> {
  try {
    const { data: staff } = await admin
      .from("staff_profiles")
      .select("full_name, role")
      .eq("id", caller.id)
      .maybeSingle();
    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const { error } = await admin.from("audit_events").insert({
      actor_id: caller.id,
      actor_name: staff?.full_name || caller.email || "Staff",
      actor_role: staff?.role || "unknown",
      category: entry.category,
      action: entry.action.slice(0, 200),
      target: entry.target?.slice(0, 300) ?? null,
      target_id: entry.targetId?.slice(0, 120) ?? null,
      result: entry.result ?? "success",
      reason: entry.reason?.trim().slice(0, 1000) || null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: forwarded.split(",")[0]?.trim().slice(0, 64) || null,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      session_id: sessionId(req),
    });
    if (error) {
      console.error("[audit] could not record", entry.category, entry.action, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[audit] could not record", entry.category, entry.action, err);
    return false;
  }
}
