import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Thrown for any condition the caller is allowed to see verbatim. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "BAD_REQUEST",
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function adminClient(): SupabaseClient {
  // Both names are accepted: some functions were deployed reading
  // SERVICE_ROLE_KEY before this helper existed, and a project that only has
  // that one set would otherwise get an unauthenticated client and fail at the
  // first query rather than at startup.
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

  if (!serviceKey) {
    console.error("[auth] no service role key in the environment");
  }

  return createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false },
  });
}

export interface Caller {
  id: string;
  email: string | null;
  /** Assurance level of this session: "aal2" once a second factor passed. */
  aal: string | null;
  /** This sign-in session (the JWT's session_id), for checks bound to one session. */
  sessionId: string | null;
}

/** The claims of a JWT the auth server has already verified. */
function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

/**
 * Resolve the caller from the request's bearer token.
 *
 * Every function that touches money must call this. Trusting a `userId` from
 * the request body lets anyone move anyone else's funds.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError("Missing Authorization header", 401, "UNAUTHENTICATED");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError("Malformed Authorization header", 401, "UNAUTHENTICATED");
  }

  // The anon client validates the JWT signature and expiry for us.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError("Invalid or expired session", 401, "UNAUTHENTICATED");
  }

  const claims = jwtClaims(token);
  const aal = claims.aal;
  const sessionId = claims.session_id;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    aal: typeof aal === "string" ? aal : null,
    sessionId: typeof sessionId === "string" ? sessionId : null,
  };
}

export type StaffRole = "agent" | "support" | "admin" | "super_admin";

/** Resolve the caller's staff role, or null when they are not staff. */
export async function staffRole(admin: SupabaseClient, userId: string): Promise<StaffRole | null> {
  const { data } = await admin
    .from("staff_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return (data?.role as StaffRole) ?? null;
}

/** Whether staff must have passed a second factor (Settings › Security). */
export async function staffMfaRequired(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("platform_settings").select("staff_mfa_required").eq("id", 1).maybeSingle();
  return !error && data?.staff_mfa_required === true;
}

/**
 * The caller must be staff with one of these roles and, while two-factor
 * sign-in is required, a session that has passed it.
 */
export async function requireStaffRole(
  admin: SupabaseClient,
  caller: Caller,
  allowed: StaffRole[],
): Promise<StaffRole> {
  const role = await staffRole(admin, caller.id);
  if (!role || !allowed.includes(role)) {
    throw new ApiError(
      `Access denied. This action requires one of: ${allowed.join(", ")}.`,
      403,
      "FORBIDDEN",
    );
  }
  if (caller.aal !== "aal2" && (await staffMfaRequired(admin))) {
    throw new ApiError("Two-factor sign-in is required. Sign in again with your authenticator code.", 403, "MFA_REQUIRED");
  }
  return role;
}

/**
 * Resolve the customer profile backing an authenticated user.
 *
 * public.customers is the only identity table. There used to be a second,
 * public.users, and every caller had to look in one then fall back to the
 * other — a dance that was already a source of bugs. It held no rows and
 * nothing referenced it, so it was dropped in 20260921120000.
 */
export interface CustomerProfile {
  id: string;
  /** Mono's payment-initiate endpoint requires a name and an email. */
  fullName: string | null;
  email: string | null;
  kycTier: number;
  pinThreshold: number;
  /** Customer's own cap, or null to use the tier default. Never above the tier. */
  singleLimit: number | null;
  dailyLimit: number | null;
}

const optionalAmount = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadCustomerProfile(
  admin: SupabaseClient,
  authUserId: string,
): Promise<CustomerProfile | null> {
  const { data: customer } = await admin
    .from("customers")
    .select("id, first_name, last_name, email, kyc_tier, pin_threshold, single_limit, daily_limit, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (customer) {
    if (customer.status && customer.status !== "active") {
      throw new ApiError(
        `Your account is currently ${customer.status} and cannot transact.`,
        403,
        "ACCOUNT_NOT_ACTIVE",
      );
    }
    const fullName = [customer.first_name, customer.last_name]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim();

    return {
      id: customer.id,
      fullName: fullName || null,
      email: typeof customer.email === "string" && customer.email.trim()
        ? customer.email.trim()
        : null,
      kycTier: Number(customer.kyc_tier) || 2,
      pinThreshold: Number(customer.pin_threshold) || 10_000,
      singleLimit: optionalAmount(customer.single_limit),
      dailyLimit: optionalAmount(customer.daily_limit),
    };
  }

  return null;
}

/** Wrap a handler so ApiError becomes a clean response and nothing else leaks. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ success: false, code: err.code, error: err.message, ...err.extra }, err.status);
      }
      console.error("[unhandled]", err);
      return json({ success: false, code: "INTERNAL_ERROR", error: "Request could not be completed" }, 500);
    }
  };
}
