import { supabase } from "@milipay/shared/lib/supabase";
import type { StaffProfile, Role, PaginatedResult } from "@milipay/shared/types";

export async function fetchStaffList(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role | "all";
} = {}): Promise<PaginatedResult<StaffProfile>> {
  const { page = 1, pageSize = 10, search = "", role = "all" } = options;

  let query = supabase.from('staff_profiles').select('*', { count: 'exact' });

  if (role !== "all") {
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
    console.error("Error fetching staff:", error);
    return { items: [], page, pageSize, totalCount: 0 };
  }

  const mappedItems: StaffProfile[] = (data || []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role as Role,
    status: row.status,
    state: row.state,
    registrationsCount: row.role === 'agent' ? 0 : undefined, // Could join with customers table to count real registrations
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
  role: Role;
  state?: string;
}): Promise<StaffProfile> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Not logged in");

  const accessToken = session.session.access_token;

  // Call the Edge Function — explicitly pass the auth header
  const { data: responseData, error } = await supabase.functions.invoke('create-staff', {
    body: {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      role: data.role,
      state: data.state
    },
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    // Try to read the actual error message from the response context
    let errorMessage = error.message;
    try {
      if ((error as any).context) {
        const body = await (error as any).context.json();
        errorMessage = body?.error || errorMessage;
      }
    } catch (_) { /* ignore parse errors */ }
    console.error("Function error:", error, "Extracted message:", errorMessage);
    throw new Error("Failed to create staff member: " + errorMessage);
  }

  if (responseData?.error) {
    throw new Error(responseData.error);
  }

  // The function creates the profile. We'll just return it so UI updates immediately.
  return {
    id: responseData.user.id,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    role: data.role,
    status: "active",
    state: data.state,
    createdAt: new Date().toISOString()
  };
}

export async function toggleStaffStatus(id: string): Promise<boolean> {
  // To toggle status, we need to know current status first
  const { data: current, error: fetchErr } = await supabase
    .from('staff_profiles')
    .select('status')
    .eq('id', id)
    .single();

  if (fetchErr) {
    console.error(fetchErr);
    throw new Error("Staff not found");
  }

  const newStatus = current.status === 'active' ? 'suspended' : 'active';

  const { error } = await supabase
    .from('staff_profiles')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    console.error("Error updating staff status:", error);
    throw new Error(error.message);
  }
  
  return true;
}
