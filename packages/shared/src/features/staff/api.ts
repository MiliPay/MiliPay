import { supabase } from "@milipay/shared/lib/supabase";
import type { CreatedStaffResult, Role } from "@milipay/shared/types";


/**
 * Where a member of staff signs in.
 *
 * These were hardcoded to http://localhost:5173/4/5, and this is the address
 * handed to a newly created employee along with their one-time password — so
 * in any deployed build every new hire was told to sign in on a machine that
 * is not theirs. They come from the environment now, and when a portal's
 * address is not configured the URL is empty and callers show the portal name
 * without a link rather than printing something that cannot work.
 */
export function getPortalDetails(role: Role): { portalName: string; portalUrl: string } {
  const env = (import.meta as any).env ?? {};
  switch (role) {
    case "admin":
    case "super_admin":
      return { portalName: "Admin Console", portalUrl: env.VITE_ADMIN_PORTAL_URL ?? "" };
    case "agent":
      return { portalName: "Agent Portal", portalUrl: env.VITE_AGENT_PORTAL_URL ?? "" };
    case "support":
      return { portalName: "Service Portal", portalUrl: env.VITE_SUPPORT_PORTAL_URL ?? "" };
    default:
      return { portalName: "Portal", portalUrl: "" };
  }
}

/**
 * Supabase wraps a non-2xx Edge Function reply in a FunctionsHttpError whose
 * message is always "Edge Function returned a non-2xx status code". The useful
 * part is the response body, which carries our ApiError message and code.
 */
async function readStaffFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    } catch {
      // Body was not JSON; fall through to the generic message.
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Create a staff account.
 *
 * Previously this had three fallback tiers: a SECURITY DEFINER RPC, the Edge
 * Function, and — if both failed — a client-side `auth.signUp()` with the anon
 * key, which created the account outside every server-side control. All three
 * defaulted the password to the literal "Password12$" and then displayed it.
 *
 * There is now one path. The server generates the password and sends it to the
 * staff member's phone; it never comes back here.
 */
export async function createStaffMember(data: {
  fullName: string;
  email: string;
  phone: string;
  nin: string;
  role: Role;
  state?: string;
}): Promise<CreatedStaffResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Not logged in");

  const portal = getPortalDetails(data.role);
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanNin = data.nin.replace(/\D/g, "");
  const ninLast4 = cleanNin.slice(-4);

  const { data: response, error } = await supabase.functions.invoke("create-staff", {
    body: {
      fullName: data.fullName.trim(),
      email: cleanEmail,
      phone: data.phone.trim(),
      nin: cleanNin,
      role: data.role,
      state: data.state || undefined,
    },
  });

  if (error) {
    throw new Error(await readStaffFunctionError(error, "Failed to create staff account."));
  }
  if (!response?.success || !response?.userId) {
    throw new Error(response?.error || "Failed to create staff account.");
  }

  return {
    profile: {
      id: response.userId,
      fullName: data.fullName.trim(),
      email: cleanEmail,
      phone: data.phone.trim(),
      nin: cleanNin,
      ninLast4,
      role: data.role,
      status: "active",
      state: data.state,
      createdAt: new Date().toISOString(),
    },
    portalUrl: portal.portalUrl,
    portalName: portal.portalName,
    delivered: Boolean(response.delivered),
    deliveryChannel: response.deliveryChannel ?? null,
    message: response.message ?? "Staff account created.",
  };
}



// ── Staff pages (design handoff, admin "Staff") ──────────────────────────

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  state: string | null;
  status: "active" | "suspended";
  createdAt: string;
  lastSignIn: string | null;
  twoFactor: boolean;
  lastAction: string | null;
  registrations: number | null;
}

export interface StaffDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  state: string | null;
  status: "active" | "suspended";
  ninLast4: string | null;
  createdAt: string;
  self: boolean;
  lastSignIn: string | null;
  twoFactor: boolean;
  registrations: number | null;
  sessions: { id: string; userAgent: string | null; ip: string | null; aal: string | null; lastActive: string; current: boolean }[];
  activity: { id: number; at: string; action: string; target: string | null; category: string; result: string }[];
}

export async function fetchStaff(): Promise<StaffRow[]> {
  const { data, error } = await supabase.rpc("admin_staff");
  if (error) throw new Error(error.message);
  return (data as StaffRow[]) ?? [];
}

export async function fetchStaffDetail(id: string): Promise<StaffDetail | null> {
  const { data, error } = await supabase.rpc("admin_staff_detail", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as StaffDetail | null) ?? null;
}

export type StaffAction = "change_role" | "suspend" | "reactivate" | "reset_2fa" | "reset_password";

/** staff-admin: every action needs a reason and goes on the audit log. */
export async function staffAction(staffId: string, action: StaffAction, reason: string, role?: Role): Promise<{ delivered: boolean | null }> {
  const { data, error } = await supabase.functions.invoke("staff-admin", { body: { staffId, action, reason, role } });
  if (error) throw new Error(await readStaffFunctionError(error, "That didn't go through."));
  if (!data?.success) throw new Error(data?.error || "That didn't go through.");
  return { delivered: data.delivered ?? null };
}

/** "Sign out other sessions" on your own profile. */
export async function signOutOtherSessions(): Promise<number> {
  const { data, error } = await supabase.rpc("revoke_other_sessions");
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
