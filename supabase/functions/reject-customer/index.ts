import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import {
  ApiError,
  adminClient,
  handler,
  json,
  requireCaller,
  requireStaffRole,
} from "../_shared/auth.ts";
import { dispatchCredential, rejectionMessage } from "../_shared/notify.ts";

/**
 * Administrator rejection of a pending enrolment.
 *
 * Role is now resolved from staff_profiles rather than a JWT claim, and the
 * notice goes out over the same WhatsApp-then-SMS path as an approval instead
 * of a second, separate Termii call.
 */

const bodySchema = z.object({
  customerId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  await requireStaffRole(admin, caller, ["admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `${issue.path.join(".") || "request"}: ${issue.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }

  const { customerId } = parsed.data;
  const reason = parsed.data.reason?.trim() ||
    "Customer did not satisfy biometric or NIN identity verification requirements.";

  const { data: customer, error: fetchError } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, status")
    .eq("id", customerId)
    .single();

  if (fetchError || !customer) {
    throw new ApiError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  if (customer.status !== "pending") {
    throw new ApiError(
      `This enrolment is ${customer.status} and is no longer awaiting a decision.`,
      409,
      "NOT_PENDING",
    );
  }

  const { error: updateError } = await admin
    .from("customers")
    .update({
      status: "rejected",
      verified_by: caller.id,
      verified_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", customerId);

  if (updateError) {
    console.error("[reject-customer] update failed", updateError);
    throw new ApiError("Could not reject this enrolment.", 400, "REJECTION_FAILED");
  }

  const fullName = `${customer.first_name} ${customer.last_name}`.trim();
  await recordAudit(admin, req, caller, {
    category: "Customers",
    action: "rejected customer",
    target: fullName,
    targetId: customerId,
    reason,
    before: { status: customer.status },
    after: { status: "rejected" },
  });

  const dispatch = await dispatchCredential(
    customer.phone,
    rejectionMessage(fullName, reason),
  );

  if (!dispatch.delivered) {
    console.error(`[reject-customer] notice dispatch failed for ${customerId}`, dispatch.attempts);
  }

  return json({
    success: true,
    customerId,
    status: "rejected",
    delivered: dispatch.delivered,
    deliveryChannel: dispatch.channel,
  });
}));
