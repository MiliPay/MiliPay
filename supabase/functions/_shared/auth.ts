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
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

export interface Caller {
  id: string;
  email: string | null;
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

  return { id: data.user.id, email: data.user.email ?? null };
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

export async function requireStaffRole(
  admin: SupabaseClient,
  userId: string,
  allowed: StaffRole[],
): Promise<StaffRole> {
  const role = await staffRole(admin, userId);
  if (!role || !allowed.includes(role)) {
    throw new ApiError(
      `Access denied. This action requires one of: ${allowed.join(", ")}.`,
      403,
      "FORBIDDEN",
    );
  }
  return role;
}

/**
 * Resolve the customer profile backing an authenticated user.
 * Mirrors the app's dual identity model: public.customers (agent-enrolled)
 * falling back to public.users (self-service).
 */
export interface CustomerProfile {
  id: string;
  kycTier: number;
  pinThreshold: number;
  source: "customers" | "users";
}

export async function loadCustomerProfile(
  admin: SupabaseClient,
  authUserId: string,
): Promise<CustomerProfile | null> {
  const { data: customer } = await admin
    .from("customers")
    .select("id, kyc_tier, pin_threshold, status")
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
    return {
      id: customer.id,
      kycTier: Number(customer.kyc_tier) || 2,
      pinThreshold: Number(customer.pin_threshold) || 10_000,
      source: "customers",
    };
  }

  const { data: user } = await admin
    .from("users")
    .select("id, kyc_tier, pin_threshold")
    .eq("id", authUserId)
    .maybeSingle();

  if (user) {
    return {
      id: user.id,
      kycTier: Number(user.kyc_tier) || 2,
      pinThreshold: Number(user.pin_threshold) || 10_000,
      source: "users",
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
