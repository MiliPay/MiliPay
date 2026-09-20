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

/**
 * Field-agent customer enrolment.
 *
 * Creates the auth account and the public.users profile for a customer being
 * registered in person. Only agents and administrators may call it: this
 * endpoint mints verified identities.
 */

const bodySchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "must be a valid phone number"),
  email: z.string().email().optional(),
  bvn: z.string().regex(/^[0-9]{11}$/, "must be 11 digits").optional(),
  nin: z.string().regex(/^[0-9]{11}$/, "must be 11 digits").optional(),
});

/** Cryptographically secure temporary password. Math.random() is not. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  // Guarantee the symbol/digit classes Supabase password policies usually want.
  return `${body}#${crypto.getRandomValues(new Uint8Array(1))[0] % 10}`;
}

function normalisePhone(phone: string): string {
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.startsWith("234")) return `+${clean}`;
  if (clean.startsWith("0")) return `+234${clean.slice(1)}`;
  return `+${clean}`;
}

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();

  // Previously unauthenticated: anyone could mint a verified account.
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

  const { bvn, nin } = parsed.data;
  const phone = normalisePhone(parsed.data.phone);
  const email = parsed.data.email?.trim().toLowerCase();
  const tempPassword = generatePassword();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    phone,
    email,
    password: tempPassword,
    email_confirm: Boolean(email),
    phone_confirm: true,
    user_metadata: { must_change_password: true, registered_by: caller.id },
  });

  if (authError || !authUser?.user) {
    throw new ApiError(authError?.message ?? "Could not create the customer account", 400, "AUTH_CREATE_FAILED");
  }

  const { error: dbError } = await admin.from("users").insert({
    id: authUser.user.id,
    phone,
    email,
    bvn,
    nin,
    kyc_tier: 2,
    pin_threshold: 10000.0,
    is_verified: true,
  });

  if (dbError) {
    // Do not leave an orphaned auth account behind.
    await admin.auth.admin.deleteUser(authUser.user.id).catch((err) =>
      console.error("[agent-register-user] rollback failed", err)
    );
    throw new ApiError(dbError.message, 400, "PROFILE_CREATE_FAILED");
  }

  // Email is the primary delivery channel during MVP (SMS via Termii is the
  // documented future fallback and intentionally not wired up here).
  return json({
    success: true,
    userId: authUser.user.id,
    tempPassword,
    deliveryChannel: email ? "email" : "manual",
  });
}));
