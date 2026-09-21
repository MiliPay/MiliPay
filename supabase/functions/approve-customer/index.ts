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
 * Administrator approval of a pending enrolment.
 *
 * Three things changed from the previous version, all of them credential leaks:
 *
 *   1. The caller could pass `customPassword`, and the portal was passing the
 *      administrator's own user id into that argument. Every customer that
 *      administrator approved ended up with the same password, stored in plain
 *      sight as customers.verified_by. The parameter is gone.
 *   2. The password was returned in the response and rendered in the portal.
 *      It now goes to the customer's phone and nowhere else.
 *   3. Passwords came from Math.random(). They now come from crypto.
 *
 * `action: "resend"` reissues a fresh password for a customer who never
 * received theirs, which is the only reason an administrator needed to see it.
 */

const bodySchema = z.object({
  customerId: z.string().uuid(),
  action: z.enum(["approve", "resend"]).default("approve"),
});

function normaliseNigerianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  // Checked against staff_profiles, not against a JWT claim the caller could
  // have been issued before a role change.
  await requireStaffRole(admin, caller.id, ["admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `${issue.path.join(".") || "request"}: ${issue.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }

  const { customerId, action } = parsed.data;

  const { data: customer, error: fetchError } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, email, status, auth_user_id")
    .eq("id", customerId)
    .single();

  if (fetchError || !customer) {
    throw new ApiError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  if (action === "approve" && customer.status !== "pending") {
    throw new ApiError(
      `This enrolment is already ${customer.status} and cannot be approved again. ` +
        "Use Resend credentials if the customer never received their password.",
      409,
      "NOT_PENDING",
    );
  }

  if (action === "resend" && customer.status !== "active") {
    throw new ApiError(
      "Only an active customer can have their credentials resent.",
      409,
      "NOT_ACTIVE",
    );
  }

  const fullName = `${customer.first_name} ${customer.last_name}`.trim();
  const phone = normaliseNigerianPhone(customer.phone);
  // Supabase requires an email on an admin-created user; customers log in with
  // their phone, so this is a stable internal address, not a contact channel.
  const authEmail = customer.email || `${customer.phone.replace(/\D/g, "")}@customer.milipay.ng`;
  const tempPassword = generateTempPassword();

  let authUserId: string | null = customer.auth_user_id;

  if (!authUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      phone,
      password: tempPassword,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { full_name: fullName, customer_id: customer.id },
      app_metadata: { role: "customer" },
    });

    if (createError || !created?.user) {
      // An identity may already exist from an earlier partial approval.
      const { data: page } = await admin.auth.admin.listUsers();
      const existing = page?.users?.find((u) => u.email === authEmail || u.phone === phone);

      if (!existing) {
        console.error("[approve-customer] auth user creation failed", createError);
        throw new ApiError(
          createError?.message ?? "Could not create the customer account.",
          400,
          "AUTH_CREATE_FAILED",
        );
      }

      authUserId = existing.id;
      await admin.auth.admin.updateUserById(existing.id, { password: tempPassword });
    } else {
      authUserId = created.user.id;
    }
  } else {
    await admin.auth.admin.updateUserById(authUserId, { password: tempPassword });
  }

  // Send before recording, so password_delivery_status reflects reality.
  const dispatch = await dispatchCredential(phone, credentialMessage(fullName, tempPassword));

  const patch: Record<string, unknown> = {
    auth_user_id: authUserId,
    must_change_password: true,
    password_delivery_channel: dispatch.channel,
    password_delivery_status: dispatch.delivered ? "delivered" : "failed",
    password_delivered_at: dispatch.delivered ? new Date().toISOString() : null,
  };

  if (action === "approve") {
    patch.status = "active";
    patch.verified_by = caller.id;
    patch.verified_at = new Date().toISOString();
    patch.rejection_reason = null;
  }

  const { error: updateError } = await admin
    .from("customers")
    .update(patch)
    .eq("id", customerId);

  if (updateError) {
    console.error("[approve-customer] customer update failed", updateError);
    throw new ApiError(
      "The account was created but the customer record could not be updated. " +
        "Do not retry; contact engineering.",
      500,
      "CUSTOMER_UPDATE_FAILED",
    );
  }

  if (!dispatch.delivered) {
    console.error(
      `[approve-customer] credential dispatch failed for ${customerId}`,
      dispatch.attempts,
    );
  }

  // The password is deliberately absent from this response.
  return json({
    success: true,
    customerId: customer.id,
    status: action === "approve" ? "active" : customer.status,
    delivered: dispatch.delivered,
    deliveryChannel: dispatch.channel,
    message: dispatch.delivered
      ? `A one-time password was sent to the customer by ${dispatch.channel}.`
      : "The account is ready, but the password could not be delivered. Use Resend credentials.",
  });
}));
