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
import { verifyIdentity, verificationMode, type IdType } from "../_shared/identity.ts";

/**
 * Standalone NIN/BVN check, called from the enrolment wizard so the agent gets
 * an answer before they reach the review step.
 *
 * The result is advisory. enrol-customer re-runs the check server-side on
 * submit, so a client that lies about having passed changes nothing.
 */

const bodySchema = z.object({
  idType: z.enum(["nin", "bvn"]),
  idNumber: z.string().regex(/^\d{11}$/, "must be exactly 11 digits"),
  claimedName: z.string().trim().min(1).max(200),
  customerId: z.string().uuid().optional(),
});

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  await requireStaffRole(admin, caller.id, ["agent", "admin", "super_admin"]);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `${issue.path.join(".") || "request"}: ${issue.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }

  const { idType, idNumber, claimedName, customerId } = parsed.data;
  const outcome = await verifyIdentity(idType as IdType, idNumber, claimedName);

  const { data: record, error } = await admin
    .from("identity_verifications")
    .insert({
      customer_id: customerId ?? null,
      id_type: idType,
      id_last_4: idNumber.slice(-4),
      mode: outcome.mode,
      provider: outcome.provider,
      status: outcome.status,
      provider_ref: outcome.providerRef,
      matched_name: outcome.matchedName,
      failure_reason: outcome.failureReason,
      requested_by: caller.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[verify-identity] could not record the attempt", error);
    throw new ApiError(
      "Identity check could not be recorded. Please try again.",
      503,
      "VERIFICATION_NOT_RECORDED",
    );
  }

  // The raw ID is never echoed back.
  return json({
    verificationId: record.id,
    status: outcome.status,
    mode: outcome.mode,
    simulated: outcome.mode === "simulated",
    matchedName: outcome.matchedName,
    failureReason: outcome.failureReason,
    providerMode: verificationMode(),
  });
}));
