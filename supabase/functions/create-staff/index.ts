import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  ApiError,
  adminClient,
  handler,
  json,
  requireCaller,
  requireStaffRole,
} from "../_shared/auth.ts";
import {
  credentialMessage,
  dispatchCredential,
  generateTempPassword,
} from "../_shared/notify.ts";

/**
 * Administrator creates a staff account.
 *
 * Brought in line with approve-customer:
 *   - the caller cannot supply a password; the server generates one with
 *     crypto, not Math.random()
 *   - the password is sent to the staff member's phone and is never returned
 *     to the administrator or rendered in a portal
 *   - the request body is no longer logged, because it carried the password
 *   - the caller's role is read from staff_profiles rather than a JWT claim
 *     that may predate a role change
 */

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().email(),
  phone: z.string().regex(/^(\+234|0)[789][01]\d{8}$/, "must be a valid Nigerian phone number"),
  nin: z.string().regex(/^\d{11}$/, "must be exactly 11 digits"),
  role: z.enum(["agent", "support", "admin", "super_admin"]),
  state: z.string().trim().max(100).optional(),
});

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  const callerRole = await requireStaffRole(admin, caller, ["admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `${issue.path.join(".") || "request"}: ${issue.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }

  const { fullName, phone, nin, role, state } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  // Only a super_admin may mint another administrator. An admin creating an
  // admin is a privilege escalation with extra steps.
  if ((role === "admin" || role === "super_admin") && callerRole !== "super_admin") {
    throw new ApiError(
      "Only a super administrator can create an administrator account.",
      403,
      "INSUFFICIENT_ROLE",
    );
  }

  const tempPassword = generateTempPassword();
  const ninLast4 = nin.slice(-4);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, nin_last_4: ninLast4, must_change_password: true },
    app_metadata: { role },
  });

  if (createError || !created?.user) {
    console.error("[create-staff] auth user creation failed", createError?.message);
    throw new ApiError(
      createError?.message ?? "Could not create the staff account.",
      400,
      "AUTH_CREATE_FAILED",
    );
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    phone,
    nin,
    nin_last_4: ninLast4,
    role,
    state: state || null,
    status: "active",
  });

  if (profileError) {
    // Do not leave an orphaned auth identity behind.
    await admin.auth.admin.deleteUser(created.user.id).catch((err) =>
      console.error("[create-staff] rollback failed", err)
    );
    console.error("[create-staff] profile insert failed", profileError.message);
    throw new ApiError(profileError.message, 400, "PROFILE_CREATE_FAILED");
  }

  const dispatch = await dispatchCredential(phone, credentialMessage(fullName, tempPassword));

  if (!dispatch.delivered) {
    console.error(`[create-staff] credential dispatch failed for ${created.user.id}`, dispatch.attempts);
  }

  // The password is deliberately absent from this response.
  return json({
    success: true,
    userId: created.user.id,
    delivered: dispatch.delivered,
    deliveryChannel: dispatch.channel,
    message: dispatch.delivered
      ? `A one-time password was sent to the staff member by ${dispatch.channel}.`
      : "The account is ready, but the password could not be delivered. Reset it from the staff profile.",
  });
}));
