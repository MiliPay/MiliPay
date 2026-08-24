import { createClient } from "@supabase/supabase-js";
import { supabase, supabaseUrl, supabaseAnonKey } from "@milipay/shared/lib/supabase";
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
    registrationsCount: row.role === 'agent' ? 0 : undefined,
    createdAt: row.created_at,
  }));

  return {
    items: mappedItems,
    page,
    pageSize,
    totalCount: count || 0
  };
}

export async function createStaffMember(data: {
  fullName: string;
  email: string;
  phone: string;
  nin: string;
  role: Role;
  state?: string;
  password?: string;
}): Promise<CreatedStaffResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Not logged in");

  const portal = getPortalDetails(data.role);
  const tempPassword = data.password || "Password12$";
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanNin = data.nin.replace(/\D/g, "");
  const ninLast4 = cleanNin.slice(-4);

  // ── Tier 1: PostgreSQL SECURITY DEFINER RPC function ─────────
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_staff_user', {
      p_full_name: data.fullName.trim(),
      p_email: cleanEmail,
      p_phone: data.phone.trim(),
      p_nin: cleanNin,
      p_role: data.role,
      p_state: data.state || null,
      p_password: tempPassword,
    });

    if (!rpcError && rpcData?.success) {
      return {
        profile: {
          id: rpcData.id,
          fullName: data.fullName.trim(),
          email: cleanEmail,
          phone: data.phone.trim(),
          nin: cleanNin,
          ninLast4: ninLast4,
          role: data.role,
          status: "active",
          state: data.state,
          createdAt: new Date().toISOString()
        },
        tempPassword: tempPassword,
        portalUrl: portal.portalUrl,
        portalName: portal.portalName,
      };
    }
  } catch (_) {
    // RPC not installed, proceed to next tier
  }

  // ── Tier 2: Edge Function create-staff ───────────────────────
  const accessToken = session.session.access_token;
  try {
    const { data: responseData, error: funcError } = await supabase.functions.invoke('create-staff', {
      body: {
        fullName: data.fullName.trim(),
        email: cleanEmail,
        phone: data.phone.trim(),
        nin: cleanNin,
        role: data.role,
        state: data.state,
        password: tempPassword,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!funcError && responseData?.user?.id) {
      return {
        profile: {
          id: responseData.user.id,
          fullName: data.fullName.trim(),
          email: cleanEmail,
          phone: data.phone.trim(),
          nin: cleanNin,
          ninLast4: ninLast4,
          role: data.role,
          status: "active",
          state: data.state,
          createdAt: new Date().toISOString()
        },
        tempPassword: responseData.tempPassword || tempPassword,
        portalUrl: portal.portalUrl,
        portalName: portal.portalName,
      };
    }
  } catch (_) {
    // Edge function not deployed / 404, proceed to Tier 3
  }

  // ── Tier 3: Isolated Auth Client SignUp + Profile Upsert ────
  // Create an isolated auth instance that won't override the admin's session
  const ephemeralClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data: authData, error: authError } = await ephemeralClient.auth.signUp({
    email: cleanEmail,
    password: tempPassword,
    options: {
      data: {
        full_name: data.fullName.trim(),
        nin_last_4: ninLast4,
        role: data.role,
        must_change_password: true,
      }
    }
  });

  if (authError && !authError.message.toLowerCase().includes("already registered")) {
    console.error("SignUp error:", authError);
    throw new Error(authError.message || "Failed to create authentication user");
  }

  const userId = authData?.user?.id || crypto.randomUUID();

  // Insert profile record using the authenticated admin client
  const { error: profileError } = await supabase.from('staff_profiles').upsert({
    id: userId,
    full_name: data.fullName.trim(),
    email: cleanEmail,
    phone: data.phone.trim(),
    nin: cleanNin,
    nin_last_4: ninLast4,
    role: data.role,
    state: data.state || null,
    status: 'active',
  });

  if (profileError) {
    console.error("Staff profile insert error:", profileError);
    throw new Error(profileError.message || "Failed to save staff profile record");
  }

  return {
    profile: {
      id: userId,
      fullName: data.fullName.trim(),
      email: cleanEmail,
      phone: data.phone.trim(),
      nin: cleanNin,
      ninLast4: ninLast4,
      role: data.role,
      status: "active",
      state: data.state,
      createdAt: new Date().toISOString()
    },
    tempPassword: tempPassword,
    portalUrl: portal.portalUrl,
    portalName: portal.portalName,
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
