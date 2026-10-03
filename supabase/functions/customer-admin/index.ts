import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole } from "../_shared/auth.ts";
import { authPhone, EMAIL_RE, PHONE_RE } from "../_shared/contact-change.ts";
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
 *   edit_details    admins. Name, phone, email, address and state. A new
 *                   phone or email changes the sign-in identity too (as the
 *                   app's own contact change does), ends every session, and
 *                   the old number is told.
 */

const bodySchema = z.object({
  customerId: z.string().uuid(),
  action: z.enum(["suspend", "reactivate", "reset_password", "edit_details"]),
  reason: z.string().trim().min(3, "Give a reason. It goes on the audit log.").max(500),
  details: z
    .object({
      firstName: z.string().trim().min(1, "Enter a first name.").max(80),
      lastName: z.string().trim().min(1, "Enter a last name.").max(80),
      phone: z.string().trim().regex(PHONE_RE, "Enter an 11-digit Nigerian phone number."),
      email: z.union([z.literal(""), z.string().trim().toLowerCase().regex(EMAIL_RE, "Check the email address.")]).optional(),
      address: z.string().trim().max(240).optional(),
      state: z.string().trim().max(40).optional(),
    })
    .optional(),
});

const PHONE_CHANGED =
  "The phone number on your MiliPay account was changed by our team. If you didn't ask for this, contact support@milipay.ng now.";

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
    .select("id, first_name, last_name, phone, email, address, state, status, auth_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (!c) throw new ApiError("That customer was not found.", 404, "NOT_FOUND");
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();

  if (action === "edit_details") {
    const d = parsed.data.details;
    if (!d) throw new ApiError("Nothing to save.", 400, "VALIDATION_FAILED");
    const now: Record<string, string | null> = {
      first_name: d.firstName,
      last_name: d.lastName,
      phone: d.phone,
      email: d.email ? d.email : null,
      address: d.address?.trim() || null,
      state: d.state?.trim() || null,
    };
    const was: Record<string, string | null> = {
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      address: c.address ?? null,
      state: c.state ?? null,
    };
    const changed = Object.keys(now).filter((k) => now[k] !== was[k]);
    if (changed.length === 0) throw new ApiError("Nothing changed.", 409, "UNCHANGED");
    const phoneChanged = changed.includes("phone");
    const emailChanged = changed.includes("email");

    if (phoneChanged) {
      const { data: taken } = await admin.from("customers").select("id").eq("phone", d.phone).neq("id", c.id).maybeSingle();
      if (taken) throw new ApiError("Another customer already uses that number.", 409, "CONTACT_TAKEN");
    }
    // The sign-in identity first: it refuses a number or email someone else holds.
    if ((phoneChanged || (emailChanged && now.email)) && c.auth_user_id) {
      const attributes: Record<string, unknown> = {};
      if (phoneChanged) {
        attributes.phone = authPhone(d.phone);
        attributes.phone_confirm = true;
      }
      if (emailChanged && now.email) {
        attributes.email = now.email;
        attributes.email_confirm = true;
      }
      const { error } = await admin.auth.admin.updateUserById(c.auth_user_id, attributes);
      if (error) {
        const taken = /already|exists|registered|unique/i.test(error.message ?? "");
        throw taken
          ? new ApiError("That email or number is already used by another account.", 409, "CONTACT_TAKEN")
          : new ApiError("Could not save the change. Please try again.", 503, "UNAVAILABLE");
      }
    }
    const { error } = await admin.from("customers").update(now).eq("id", c.id);
    if (error) {
      console.error("[customer-admin] details not saved", error);
      throw new ApiError("Could not save the change. Please try again.", 503, "UNAVAILABLE");
    }
    if ((phoneChanged || emailChanged) && c.auth_user_id) {
      const { error: revokeError } = await admin.rpc("revoke_auth_sessions", { p_user: c.auth_user_id });
      if (revokeError) console.error("[customer-admin] sessions not revoked", revokeError.message);
    }
    await recordAudit(admin, req, caller, {
      category: "Customers",
      action: "edited details of",
      target: name || c.phone,
      targetId: c.id,
      reason,
      before: Object.fromEntries(changed.map((k) => [k, was[k]])),
      after: Object.fromEntries(changed.map((k) => [k, now[k]])),
    });
    if (phoneChanged && c.phone) {
      const told = await dispatchSms(c.phone, PHONE_CHANGED);
      if (!told.delivered) console.error("[customer-admin] old number not told", told.attempts);
    }
    return json({ success: true, changed });
  }

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
