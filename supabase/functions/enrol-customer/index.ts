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
import { verifyIdentity } from "../_shared/identity.ts";

/**
 * Agent enrolment.
 *
 * This exists because the portal used to INSERT into public.customers directly.
 * The RLS insert policy checked only that the caller was an agent, not what
 * they were writing, so an agent could post status:'active', kyc_tier:3 and
 * mint a fully-verified account with no administrator involved.
 *
 * Everything security-relevant is now decided here, server-side:
 *   - status is 'pending' for an agent, 'active' only for an administrator
 *   - kyc_tier is derived from what was actually captured, not from the body
 *   - the NIN is re-verified rather than trusted from the client
 */

const SIMULATED_PALM_PREFIXES = ["SIMULATED-PVT-", "PVT-mock-hash-"];
const SIMULATED_FACE_PREFIX = "SIMULATED-FACE-";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  gender: z.enum(["male", "female"]),
  nin: z.string().regex(/^\d{11}$/, "must be exactly 11 digits"),
  bvn: z.string().regex(/^\d{11}$/, "must be exactly 11 digits").optional(),
  phone: z.string().regex(/^(\+234|0)[789][01]\d{8}$/, "must be a valid Nigerian phone number"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().trim().min(3).max(500),
  state: z.string().trim().min(2).max(100),
  palmVeinTemplate: z.string().trim().min(1, "a palm vein capture is required"),
  faceTemplate: z.string().trim().min(1, "a facial capture is required"),
});

function normalisePhone(phone: string): string {
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.startsWith("234")) return `+${clean}`;
  if (clean.startsWith("0")) return `+234${clean.slice(1)}`;
  return `+${clean}`;
}

const isSimulatedPalm = (t: string) => SIMULATED_PALM_PREFIXES.some((p) => t.startsWith(p));
const isSimulatedFace = (t: string) => t.startsWith(SIMULATED_FACE_PREFIX);

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  const role = await requireStaffRole(admin, caller.id, ["agent", "admin", "super_admin"]);
  const isAdmin = role === "admin" || role === "super_admin";

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `${issue.path.join(".") || "request"}: ${issue.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }

  const draft = parsed.data;
  const phone = normalisePhone(draft.phone);
  const email = draft.email?.trim().toLowerCase() || null;

  const allowSimulated = Deno.env.get("ALLOW_SIMULATED_BIOMETRICS") === "true";
  const palmSimulated = isSimulatedPalm(draft.palmVeinTemplate);
  const faceSimulated = isSimulatedFace(draft.faceTemplate);

  if ((palmSimulated || faceSimulated) && !allowSimulated) {
    throw new ApiError(
      "This capture was simulated and cannot be used to enrol a customer. " +
        "Connect the enrolment hardware and capture again.",
      400,
      "SIMULATED_BIOMETRIC_REJECTED",
    );
  }

  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    throw new ApiError(
      "A customer is already enrolled with this phone number.",
      409,
      "PHONE_ALREADY_ENROLLED",
    );
  }

  // Re-verify server-side. The client's claim that the NIN passed is not
  // evidence; in simulated mode this is deterministic and costs nothing.
  const ninOutcome = await verifyIdentity("nin", draft.nin, draft.fullName);
  if (ninOutcome.status === "failed") {
    throw new ApiError(
      ninOutcome.failureReason ?? "This NIN could not be verified.",
      400,
      "NIN_VERIFICATION_FAILED",
    );
  }

  const bvnOutcome = draft.bvn
    ? await verifyIdentity("bvn", draft.bvn, draft.fullName)
    : null;

  const nameParts = draft.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Unknown";

  // Tier reflects what was actually captured and verified, not what was asked
  // for. Tier 2 is NIN verified plus a real palm vein and face on file;
  // anything short of that stays Tier 1 until an administrator has more to go on.
  const qualifiesForTier2 = ninOutcome.status === "verified" && !palmSimulated && !faceSimulated;
  const kycTier = qualifiesForTier2 ? 2 : 1;
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      address: draft.address,
      state: draft.state,
      date_of_birth: draft.dateOfBirth,
      gender: draft.gender,
      nin: draft.nin,
      nin_last_4: draft.nin.slice(-4),
      nin_verified: ninOutcome.status === "verified",
      nin_verified_at: ninOutcome.status === "verified" ? now : null,
      bvn: draft.bvn ?? null,
      bvn_last_4: draft.bvn ? draft.bvn.slice(-4) : null,
      bvn_verified: bvnOutcome?.status === "verified",
      bvn_verified_at: bvnOutcome?.status === "verified" ? now : null,
      palm_vein_template: draft.palmVeinTemplate,
      palm_simulated: palmSimulated,
      face_template: draft.faceTemplate,
      face_captured_at: now,
      face_simulated: faceSimulated,
      kyc_tier: kycTier,
      pin_threshold: 10000.0,
      // An agent enrols; an administrator approves. An administrator enrolling
      // in person is both, so their enrolment lands active.
      status: isAdmin ? "active" : "pending",
      must_change_password: true,
      registered_by: caller.id,
      verified_by: isAdmin ? caller.id : null,
      verified_at: isAdmin ? now : null,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 is unique_violation. The NIN index is the only one that can fire
    // here besides phone, which is already handled above.
    if ((insertError as { code?: string }).code === "23505") {
      throw new ApiError(
        "This NIN is already enrolled with MiliPay.",
        409,
        "NIN_ALREADY_ENROLLED",
      );
    }
    console.error("[enrol-customer] insert failed", insertError);
    throw new ApiError("Could not save this enrolment. Please try again.", 400, "ENROLMENT_FAILED");
  }

  // Attach the verification audit rows to the customer they belong to.
  const verificationRows: Record<string, unknown>[] = [
    {
      customer_id: inserted.id,
      id_type: "nin",
      id_last_4: draft.nin.slice(-4),
      mode: ninOutcome.mode,
      provider: ninOutcome.provider,
      status: ninOutcome.status,
      provider_ref: ninOutcome.providerRef,
      matched_name: ninOutcome.matchedName,
      failure_reason: ninOutcome.failureReason,
      requested_by: caller.id,
    },
  ];

  if (bvnOutcome && draft.bvn) {
    verificationRows.push({
      customer_id: inserted.id,
      id_type: "bvn",
      id_last_4: draft.bvn.slice(-4),
      mode: bvnOutcome.mode,
      provider: bvnOutcome.provider,
      status: bvnOutcome.status,
      provider_ref: bvnOutcome.providerRef,
      matched_name: bvnOutcome.matchedName,
      failure_reason: bvnOutcome.failureReason,
      requested_by: caller.id,
    });
  }

  const { error: auditError } = await admin.from("identity_verifications").insert(verificationRows);
  if (auditError) {
    // The enrolment is already saved; losing the audit row must not lose the
    // customer. Log loudly so it can be reconciled.
    console.error("[enrol-customer] verification audit insert failed", auditError);
  }

  return json({
    customerId: inserted.id,
    status: isAdmin ? "active" : "pending",
    requiresAdminVerification: !isAdmin,
    kycTier,
    ninVerified: ninOutcome.status === "verified",
    ninVerificationMode: ninOutcome.mode,
    bvnVerified: bvnOutcome?.status === "verified",
  });
}));
