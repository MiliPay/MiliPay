import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole } from "../_shared/auth.ts";
import { dispatchSms } from "../_shared/notify.ts";

/**
 * Account actions on a customer from the portals (design handoff, customer
 * detail and the support desk). Every one needs a reason, writes the audit
 * log, and tells the customer by SMS.
 *
 *   suspend         admins. Payments and app access stop: status
 *                   'suspended' and every session ended now.
 *   reactivate      admins, and only from 'suspended'. A rejected customer is
 *                   not reactivated here: that would skip the identity check,
 *                   so they register again with an agent.
 *   reset_password  admins and support. The old password stops working and
 *                   every session ends. The customer signs in with their
 *                   phone number and an SMS code as usual, and sets a new
 *                   password with "Forgot password" in the app.
 */

const bodySchema = z.object({
  customerId: z.string().uuid(),
  action: z.enum(["suspend", "reactivate", "reset_password"]),
  reason: z.string().trim().min(3, "Give a reason. It goes on the audit log.").max(500),
});

export const SMS = {
  suspend:
    "Your MiliPay account has been paused, so palm payments and the app are off for now. If you didn't expect this, contact support@milipay.ng.",
  reactivate: "Your MiliPay account is active again. You can log in and pay as usual.",
  reset_password:
    "Your MiliPay password has been reset by our team. Log in with your phone number and the SMS code, then tap Forgot password to set a new one.",
} as const;

/** A password nobody knows, so the old one stops working. */
function unguessablePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(issue.message, 400, "VALIDATION_FAILED");
  }
  const { customerId, action, reason } = parsed.data;
  await requireStaffRole(
    admin,
    caller,
    action === "reset_password" ? ["admin", "super_admin", "support"] : ["admin", "super_admin"],
  );

  const { data: c } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, status, auth_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (!c) throw new ApiError("That customer was not found.", 404, "NOT_FOUND");
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();

  if (action === "suspend" && c.status !== "active") {
    throw new ApiError("Only an active account can be suspended.", 409, "NOT_ACTIVE");
  }
  if (action === "reactivate" && c.status !== "suspended") {
    throw new ApiError("Only a suspended account can be reactivated here.", 409, "NOT_SUSPENDED");
  }
  if (action === "reset_password" && (c.status !== "active" || !c.auth_user_id)) {
    throw new ApiError("This customer has no active login to reset.", 409, "NO_LOGIN");
  }

  if (action === "suspend" || action === "reactivate") {
    const status = action === "suspend" ? "suspended" : "active";
    // Only from the state checked above, so two staff can't race each other.
    const { data: updated, error } = await admin
      .from("customers")
      .update({ status })
      .eq("id", c.id)
      .eq("status", c.status)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[customer-admin] status update failed", error);
      throw new ApiError("Could not change the account. Please try again.", 503, "UNAVAILABLE");
    }
    if (!updated) throw new ApiError("Someone else changed this account just now. Reload and check.", 409, "CHANGED");
  } else {
    const { error } = await admin.auth.admin.updateUserById(c.auth_user_id, { password: unguessablePassword() });
    if (error) {
      console.error("[customer-admin] password reset failed", error.message);
      throw new ApiError("Could not reset the password. Please try again.", 503, "UNAVAILABLE");
    }
    await admin.from("customers").update({ password_changed_at: null }).eq("id", c.id);
  }

  // Suspension and a reset both end every session on every device now.
  if ((action === "suspend" || action === "reset_password") && c.auth_user_id) {
    const { error } = await admin.rpc("revoke_auth_sessions", { p_user: c.auth_user_id });
    if (error) console.error("[customer-admin] sessions not revoked", error.message);
  }

  await recordAudit(admin, req, caller, {
    category: "Customers",
    action: { suspend: "suspended customer", reactivate: "reactivated customer", reset_password: "reset the password of" }[action],
    target: name || c.phone,
    targetId: c.id,
    reason,
    before: action === "reset_password" ? null : { status: c.status },
    after: action === "reset_password" ? { sessionsEnded: true } : { status: action === "suspend" ? "suspended" : "active" },
  });

  const sms = await dispatchSms(c.phone, SMS[action]);
  if (!sms.delivered) console.error("[customer-admin] customer not told", sms.attempts);
  return json({ success: true, customerTold: sms.delivered });
}));
