import { supabase } from "@milipay/shared/lib/supabase";
import type { 
  CreatedStaffResult, 
  PaginatedResult, 
  Role, 
  StaffProfile 
} from "@milipay/shared/types";

export { fetchStaffMembers as fetchStaffList };

interface FetchStaffOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role | "";
}

export function getPortalDetails(role: Role): { portalName: string; portalUrl: string } {
  switch (role) {
    case "admin":
    case "super_admin":
      return {
        portalName: "Admin Console",
        portalUrl: "http://localhost:5173",
      };
    case "agent":
      return {
        portalName: "Agent Portal",
        portalUrl: "http://localhost:5174",
      };
    case "support":
      return {
        portalName: "Service Portal",
        portalUrl: "http://localhost:5175",
      };
    default:
      return {
        portalName: "Portal",
        portalUrl: "http://localhost:5173",
      };
  }
}

export async function fetchStaffMembers(
  options: FetchStaffOptions = {}
): Promise<PaginatedResult<StaffProfile>> {
  const { page = 1, pageSize = 10, search = "", role = "" } = options;

  let query = supabase.from('staff_profiles').select('*', { count: 'exact' });

  if (role) {
    query = query.eq('role', role);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query
    .range(start, start + pageSize - 1)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching staff profiles:", error);
    return {
      items: [],
      page,
      pageSize,
      totalCount: 0
    };
  }

  // Batch calculate real-time customer registration counts for agents
  const agentIds = (data || []).filter((r: any) => r.role === 'agent').map((r: any) => r.id);
  const regCountMap: Record<string, number> = {};

  if (agentIds.length > 0) {
    try {
      const { data: customerCounts } = await supabase
        .from('customers')
        .select('registered_by');

      (customerCounts || []).forEach((c: any) => {
        if (c.registered_by) {
          regCountMap[c.registered_by] = (regCountMap[c.registered_by] || 0) + 1;
        }
      });
    } catch (countErr) {
      console.warn("Could not fetch agent registration counts:", countErr);
    }
  }

  const mappedItems: StaffProfile[] = (data || []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    nin: row.nin,
    ninLast4: row.nin_last_4,
    role: row.role as Role,
    status: row.status,
    state: row.state,
    registrationsCount: row.role === 'agent' ? (regCountMap[row.id] || 0) : undefined,
    createdAt: row.created_at,
  }));

  return {
    items: mappedItems,
    page,
    pageSize,
    totalCount: count || 0
  };
}

export async function fetchStaffDetails(id: string): Promise<{
  profile: StaffProfile;
  stats?: {
    totalEnrolled: number;
    pendingKYC: number;
    approvedKYC: number;
    rejectedKYC: number;
    recentCustomers: Array<{ id: string; fullName: string; phone: string; status: string; createdAt: string }>;
  };
} | null> {
  const { data: profileRow, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !profileRow) {
    console.error("Error fetching staff profile details:", error);
    return null;
  }

  const profile: StaffProfile = {
    id: profileRow.id,
    fullName: profileRow.full_name,
    email: profileRow.email,
    phone: profileRow.phone,
    nin: profileRow.nin,
    ninLast4: profileRow.nin_last_4,
    role: profileRow.role as Role,
    status: profileRow.status,
    state: profileRow.state,
    createdAt: profileRow.created_at,
  };

  if (profile.role === 'agent') {
    try {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone, status, created_at')
        .eq('registered_by', id)
        .order('created_at', { ascending: false });

      const customerList = customers || [];
      const totalEnrolled = customerList.length;
      const pendingKYC = customerList.filter((c: any) => c.status === 'pending').length;
      const approvedKYC = customerList.filter((c: any) => c.status === 'active').length;
      const rejectedKYC = customerList.filter((c: any) => c.status === 'rejected').length;

      return {
        profile: {
          ...profile,
          registrationsCount: totalEnrolled,
        },
        stats: {
          totalEnrolled,
          pendingKYC,
          approvedKYC,
          rejectedKYC,
          recentCustomers: customerList.slice(0, 5).map((c: any) => ({
            id: c.id,
            fullName: `${c.first_name} ${c.last_name}`.trim(),
            phone: c.phone,
            status: c.status,
            createdAt: c.created_at,
          })),
        },
      };
    } catch (err) {
      console.warn("Could not load agent stats:", err);
    }
  }

  return { profile };
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


export async function toggleStaffStatus(id: string): Promise<boolean> {
  const { data, error: fetchError } = await supabase
    .from('staff_profiles')
    .select('status')
    .eq('id', id)
    .single();

  if (fetchError || !data) {
    console.error("Error fetching staff status:", fetchError);
    return false;
  }

  const newStatus = data.status === 'active' ? 'suspended' : 'active';

  const { error: updateError } = await supabase
    .from('staff_profiles')
    .update({ status: newStatus })
    .eq('id', id);

  if (updateError) {
    console.error("Error updating staff status:", updateError);
    return false;
  }

  return true;
}

export async function deleteStaffMember(id: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized: You must be authenticated to perform this operation.");

  const { data: currentStaff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentStaff || (currentStaff.role !== "admin" && currentStaff.role !== "super_admin")) {
    throw new Error("Forbidden: Only administrators have permission to delete staff profiles.");
  }

  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;

  // Attempt 1: Call database RPC function delete_staff_user
  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_staff_user', {
    target_user_id: id,
  });

  if (!rpcError && rpcData) {
    return true;
  }

  // Attempt 2: Call Edge function delete-staff
  if (accessToken) {
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delete-staff', {
        body: { staffId: id },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!edgeError && edgeData?.success) {
        return true;
      }
    } catch (_) { /* ignore */ }
  }

  // Attempt 3: Direct delete on public.staff_profiles
  const { error } = await supabase
    .from('staff_profiles')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Error deleting staff profile:", error);
    throw new Error(error.message || "Failed to delete staff member");
  }

  return true;
}
