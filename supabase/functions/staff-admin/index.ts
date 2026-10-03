import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole, type StaffRole } from "../_shared/auth.ts";
import { dispatchCredential, generateTempPassword, staffCredentialMessage } from "../_shared/notify.ts";

/**
 * Actions on a member of staff (design handoff, admin "Staff" profile).
 * Every one needs a reason and goes on the audit log.
 *
 *   change_role     their portal and permissions change on their next request
 *   suspend         status 'suspended', the login is banned and every
 *                   session ends now
 *   reactivate      only from suspended
 *   reset_2fa       their authenticator is removed and every session ends;
 *                   they set one up again on next sign-in
 *   reset_password  a new one-time password goes to their phone, every
 *                   session ends, and they choose their own on sign-in
 *
 * Who may act on whom follows create-staff: an admin manages agents and
 * support; only a super admin manages admins or makes someone one. Nobody
 * acts on themselves here (that would let an admin lift their own
 * suspension or quietly drop their own second factor).
 */

const ROLES = ["agent", "support", "admin", "super_admin"] as const;

const bodySchema = z.object({
  staffId: z.string().uuid(),
  action: z.enum(["change_role", "suspend", "reactivate", "reset_2fa", "reset_password"]),
  role: z.enum(ROLES).optional(),
  reason: z.string().trim().min(3, "Give a reason. It goes on the audit log.").max(500),
});

const PORTAL: Record<StaffRole, string> = {
  agent: "agent portal",
  support: "support portal",
  admin: "admin console",
  super_admin: "admin console",
};

const isAdminRole = (r: string | null | undefined) => r === "admin" || r === "super_admin";

const ACTION_LABEL = {
  change_role: "changed role of",
  suspend: "suspended staff",
  reactivate: "reactivated staff",
  reset_2fa: "reset 2FA for",
  reset_password: "reset the password of",
} as const;

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  const callerRole = await requireStaffRole(admin, caller, ["admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Check the request.", 400, "VALIDATION_FAILED");
  const { staffId, action, reason } = parsed.data;

  if (staffId === caller.id) {
    throw new ApiError("You can't do this to your own account. Ask another administrator.", 403, "SELF");
  }

  const { data: target } = await admin
    .from("staff_profiles")
    .select("id, full_name, email, phone, role, status")
    .eq("id", staffId)
    .maybeSingle();
  if (!target) throw new ApiError("That staff member was not found.", 404, "NOT_FOUND");

  // An admin manages agents and support; administrators are a super admin's.
  if (callerRole !== "super_admin" && (isAdminRole(target.role) || (action === "change_role" && isAdminRole(parsed.data.role)))) {
    throw new ApiError("Only a super administrator can manage administrators.", 403, "INSUFFICIENT_ROLE");
  }

  const status = target.status ?? "active";
  let before: Record<string, unknown> | null = null;
  let after: Record<string, unknown> | null = null;
  let endSessions = false;
  let delivered: boolean | null = null;

  if (action === "change_role") {
    const role = parsed.data.role;
    if (!role) throw new ApiError("Choose the new role.", 400, "VALIDATION_FAILED");
    if (role === target.role) throw new ApiError(`They're already ${role.replace("_", " ")}.`, 409, "UNCHANGED");
    const { error } = await admin.from("staff_profiles").update({ role }).eq("id", target.id).eq("role", target.role);
    if (error) throw new ApiError("Could not change the role. Please try again.", 503, "UNAVAILABLE");
    // The admin policies read the role from the token's app_metadata.
    const { error: authError } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { role } });
    if (authError) {
      await admin.from("staff_profiles").update({ role: target.role }).eq("id", target.id);
      throw new ApiError("Could not change the role. Please try again.", 503, "UNAVAILABLE");
    }
    before = { role: target.role };
    after = { role };
    // Their current token still carries the old role; make them sign in again.
    endSessions = true;
  }

  if (action === "suspend" || action === "reactivate") {
    const from = action === "suspend" ? "active" : "suspended";
    const to = action === "suspend" ? "suspended" : "active";
    if (status !== from) {
      throw new ApiError(action === "suspend" ? "They're already suspended." : "Only a suspended account can be reactivated.", 409, "WRONG_STATUS");
    }
    const { data: changed, error } = await admin
      .from("staff_profiles")
      .update({ status: to })
      .eq("id", target.id)
      .eq("status", from)
      .select("id")
      .maybeSingle();
    if (error) throw new ApiError("Could not change the account. Please try again.", 503, "UNAVAILABLE");
    if (!changed) throw new ApiError("Someone else changed this account just now. Reload and check.", 409, "CHANGED");
    // A ban stops new sign-ins; a suspended login can't come back with its old password.
    const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: action === "suspend" ? "876000h" : "none",
    } as Record<string, unknown>);
    if (banError) console.error("[staff-admin] ban not updated", banError.message);
    before = { status: from };
    after = { status: to };
    endSessions = action === "suspend";
  }

  if (action === "reset_2fa") {
    const { data: factors, error } = await admin.auth.admin.mfa.listFactors({ userId: target.id });
    if (error) throw new ApiError("Could not read their two-factor settings. Please try again.", 503, "UNAVAILABLE");
    const list = factors?.factors ?? [];
    if (list.length === 0) throw new ApiError("They don't have two-factor set up.", 409, "NO_FACTOR");
    for (const f of list) {
      const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ userId: target.id, id: f.id });
      if (delError) throw new ApiError("Could not remove their authenticator. Please try again.", 503, "UNAVAILABLE");
    }
    before = { twoFactor: true };
    after = { twoFactor: false };
    endSessions = true;
  }

  if (action === "reset_password") {
    if (status !== "active") throw new ApiError("Reactivate them first.", 409, "WRONG_STATUS");
    if (!target.phone) throw new ApiError("There's no phone number to send the password to.", 409, "NO_PHONE");
    const password = generateTempPassword();
    const { error } = await admin.auth.admin.updateUserById(target.id, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new ApiError("Could not reset the password. Please try again.", 503, "UNAVAILABLE");
    const sent = await dispatchCredential(
      target.phone,
      staffCredentialMessage(target.full_name ?? "there", target.email ?? "your work email", PORTAL[target.role as StaffRole] ?? "portal", password),
    );
    delivered = sent.delivered;
    if (!sent.delivered) console.error("[staff-admin] password not delivered", target.id, sent.attempts);
    after = { sessionsEnded: true, passwordSent: sent.delivered };
    endSessions = true;
  }

  if (endSessions) {
    const { error } = await admin.rpc("revoke_auth_sessions", { p_user: target.id });
    if (error) console.error("[staff-admin] sessions not revoked", error.message);
  }

  await recordAudit(admin, req, caller, {
    category: "Staff",
    action: ACTION_LABEL[action],
    target: target.full_name ?? target.email,
    targetId: target.id,
    reason,
    before,
    after,
  });

  return json({ success: true, delivered });
}));
