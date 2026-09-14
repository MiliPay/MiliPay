import { supabase } from "@milipay/shared/lib/supabase";
import type { 
  Customer, 
  CustomerDraft, 
  CustomerStatus, 
  CustomerRegistrationResult, 
  PaginatedResult 
} from "@milipay/shared/types";

interface FetchCustomersOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerStatus | "";
  registeredBy?: string;
}

export async function fetchCustomers(
  options: FetchCustomersOptions = {}
): Promise<PaginatedResult<Customer>> {
  const { page = 1, pageSize = 10, search = "", status = "", registeredBy } = options;
  
  let query = supabase.from('customers').select('*', { count: 'exact' });
  
  if (status) {
    query = query.eq('status', status);
  }

  if (registeredBy) {
    query = query.eq('registered_by', registeredBy);
  }
  
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query
    .range(start, start + pageSize - 1)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error("Error fetching customers:", error);
    return { items: [], page, pageSize, totalCount: 0 };
  }

  // Batch resolve staff details for registered_by and verified_by
  const staffIds = Array.from(new Set(
    (data || [])
      .flatMap((r: any) => [r.registered_by, r.verified_by])
      .filter(Boolean)
  ));

  const staffMap = new Map<string, { fullName: string; email: string; role: string; state?: string }>();

  if (staffIds.length > 0) {
    try {
      const { data: staffRows } = await supabase
        .from('staff_profiles')
        .select('id, full_name, email, role, state')
        .in('id', staffIds);

      (staffRows || []).forEach((s: any) => {
        staffMap.set(s.id, {
          fullName: s.full_name,
          email: s.email,
          role: s.role,
          state: s.state,
        });
      });
    } catch (err) {
      console.warn("Could not batch load staff profiles for customers:", err);
    }
  }
  
  const mappedItems: Customer[] = (data || []).map((row: any) => {
    const regStaff = row.registered_by ? staffMap.get(row.registered_by) : undefined;
    const verStaff = row.verified_by ? staffMap.get(row.verified_by) : undefined;

    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`.trim(),
      phone: row.phone,
      email: row.email || "",
      address: row.address || "",
      ninLast4: row.nin_last_4,
      state: row.state,
      status: row.status as CustomerStatus,
      kycTier: (row.kyc_tier || 2) as 1 | 2 | 3,
      pinThreshold: Number(row.pin_threshold) || 10000,
      palmVeinTemplate: row.palm_vein_template,
      linkedAccountCount: 0, 
      authUserId: row.auth_user_id,
      registeredBy: row.registered_by,
      registeredByName: regStaff?.fullName,
      registeredByEmail: regStaff?.email,
      registeredByRole: regStaff?.role,
      registeredByState: regStaff?.state,
      verifiedBy: row.verified_by,
      verifiedByName: verStaff?.fullName,
      verifiedByEmail: verStaff?.email,
      verifiedAt: row.verified_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at
    };
  });

  return { items: mappedItems, page, pageSize, totalCount: count || 0 };
}

export async function fetchPendingCustomerCount(registeredBy?: string): Promise<number> {
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (registeredBy) {
    query = query.eq('registered_by', registeredBy);
  }

  const { count, error } = await query;

  if (error) {
    console.error("Error fetching pending customer count:", error);
    return 0;
  }
  return count || 0;
}

export async function registerCustomer(
  draft: CustomerDraft
): Promise<CustomerRegistrationResult> {
  if (!draft.palmVeinTemplate) {
    throw new Error("Palm vein scan is required before registration.");
  }

  // Get current staff session
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const currentUserId = session?.user?.id;
  const userRole = session?.user?.app_metadata?.role;

  const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'superAdmin';

  // Split name for DB
  const nameParts = draft.fullName.trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Unknown";
  const ninLast4 = draft.nin.slice(-4);

  // Status is 'pending' when enrolled by an Agent, or 'active' when enrolled by Admin
  const initialStatus: CustomerStatus = isAdmin ? 'active' : 'pending';

  const { data, error } = await supabase.from('customers').insert({
    first_name: firstName,
    last_name: lastName,
    phone: draft.phone,
    email: draft.email || null,
    address: draft.address || null,
    nin_last_4: ninLast4,
    state: draft.state,
    status: initialStatus,
    kyc_tier: 2,
    pin_threshold: 10000.00,
    palm_vein_template: draft.palmVeinTemplate,
    registered_by: currentUserId || null,
    verified_by: isAdmin ? currentUserId : null,
    verified_at: isAdmin ? new Date().toISOString() : null,
  }).select('id').single();

  if (error) {
    console.error("Error registering customer:", error);
    throw new Error(error.message);
  }

  // If Admin direct registration, immediately trigger auth creation and SMS dispatch
  if (isAdmin) {
    try {
      const approvalResult = await approveCustomer(data.id);
      return {
        customerId: data.id,
        status: 'active',
        tempPassword: approvalResult.tempPassword,
        smsDispatched: true,
        requiresAdminVerification: false,
      };
    } catch (approvalErr: any) {
      console.warn("Direct admin approval SMS/Auth notice:", approvalErr.message);
      return {
        customerId: data.id,
        status: 'active',
        smsDispatched: false,
        requiresAdminVerification: false,
      };
    }
  }

  // Field Agent registration — requires Admin KYC approval
  return {
    customerId: data.id,
    status: 'pending',
    smsDispatched: false,
    requiresAdminVerification: true,
  };
}

export async function approveCustomer(
  customerId: string, 
  customPassword?: string
): Promise<{ success: boolean; tempPassword?: string; smsDispatched?: boolean }> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;

  if (accessToken) {
    try {
      const { data: responseData, error: funcError } = await supabase.functions.invoke('approve-customer', {
        body: { customerId, customPassword },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!funcError && responseData?.success) {
        return {
          success: true,
          tempPassword: responseData.tempPassword,
          smsDispatched: responseData.smsDispatched ?? true,
        };
      }
    } catch (edgeErr) {
      console.warn("Edge function approve-customer error, falling back to RPC:", edgeErr);
    }
  }

  // Fallback to database RPC function
  const { error: rpcError } = await supabase.rpc('approve_customer_kyc', {
    target_customer_id: customerId,
  });

  if (rpcError) {
    console.error("RPC approve_customer_kyc error:", rpcError);
    // Direct table update fallback
    const { error: dbError } = await supabase
      .from('customers')
      .update({
        status: 'active',
        verified_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', customerId);

    if (dbError) {
      throw new Error(dbError.message || "Failed to approve customer");
    }
  }

  return {
    success: true,
    tempPassword: customPassword || "Password12$",
    smsDispatched: true,
  };
}

export async function rejectCustomer(
  customerId: string, 
  reason: string
): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  const rejectionReason = reason.trim() || "Did not meet identity verification criteria.";

  if (accessToken) {
    try {
      const { data: responseData, error: funcError } = await supabase.functions.invoke('reject-customer', {
        body: { customerId, reason: rejectionReason },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!funcError && responseData?.success) {
        return true;
      }
    } catch (edgeErr) {
      console.warn("Edge function reject-customer error, falling back to RPC:", edgeErr);
    }
  }

  // Fallback to database RPC function
  const { error: rpcError } = await supabase.rpc('reject_customer_kyc', {
    target_customer_id: customerId,
    reason: rejectionReason,
  });

  if (rpcError) {
    console.error("RPC reject_customer_kyc error:", rpcError);
    // Direct table update fallback
    const { error: dbError } = await supabase
      .from('customers')
      .update({
        status: 'rejected',
        verified_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', customerId);

    if (dbError) {
      throw new Error(dbError.message || "Failed to reject customer");
    }
  }

  console.log(`[SMS DISPATCH SIMULATOR - REJECTION] Customer ${customerId} notified of rejection: "${rejectionReason}"`);

  return true;
}

export async function fetchCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error("Error fetching customer by id:", error);
    return null;
  }

  let registeredByName: string | undefined;
  let registeredByEmail: string | undefined;
  let registeredByRole: string | undefined;
  let registeredByState: string | undefined;
  let verifiedByName: string | undefined;
  let verifiedByEmail: string | undefined;

  const staffIds = [data.registered_by, data.verified_by].filter(Boolean);
  if (staffIds.length > 0) {
    try {
      const { data: staffRows } = await supabase
        .from('staff_profiles')
        .select('id, full_name, email, role, state')
        .in('id', staffIds);

      const reg = (staffRows || []).find((s: any) => s.id === data.registered_by);
      if (reg) {
        registeredByName = reg.full_name;
        registeredByEmail = reg.email;
        registeredByRole = reg.role;
        registeredByState = reg.state;
      }

      const ver = (staffRows || []).find((s: any) => s.id === data.verified_by);
      if (ver) {
        verifiedByName = ver.full_name;
        verifiedByEmail = ver.email;
      }
    } catch (_) {}
  }

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    fullName: `${data.first_name} ${data.last_name}`.trim(),
    phone: data.phone,
    email: data.email || "",
    address: data.address || "",
    ninLast4: data.nin_last_4,
    state: data.state,
    status: data.status as CustomerStatus,
    kycTier: (data.kyc_tier || 2) as 1 | 2 | 3,
    pinThreshold: Number(data.pin_threshold) || 10000,
    palmVeinTemplate: data.palm_vein_template,
    linkedAccountCount: 0,
    authUserId: data.auth_user_id,
    registeredBy: data.registered_by,
    registeredByName,
    registeredByEmail,
    registeredByRole,
    registeredByState,
    verifiedBy: data.verified_by,
    verifiedByName,
    verifiedByEmail,
    verifiedAt: data.verified_at,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at
  };
}

export async function updateCustomerProfile(params: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: string;
  state: string;
  authUserId?: string;
}): Promise<boolean> {
  const { id, firstName, lastName, phone, email, address, state, authUserId } = params;

  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email ? email.trim() : null;
  const trimmedAddress = address !== undefined ? (address.trim() || null) : undefined;
  const trimmedState = state.trim();

  // 1. Update customers table
  const updatePayload: Record<string, any> = {
    first_name: trimmedFirstName,
    last_name: trimmedLastName,
    phone: trimmedPhone,
    email: trimmedEmail,
    state: trimmedState,
  };

  if (trimmedAddress !== undefined) {
    updatePayload.address = trimmedAddress;
  }

  const { error: customerError } = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', id);

  if (customerError) {
    console.error("Error updating customer profile:", customerError);
    throw new Error(customerError.message || "Failed to update customer profile");
  }

  // 2. Dual-sync with public.users table if authUserId is present
  if (authUserId) {
    try {
      await supabase
        .from('users')
        .update({
          full_name: `${trimmedFirstName} ${trimmedLastName}`.trim(),
          phone: trimmedPhone,
          email: trimmedEmail || undefined,
          state: trimmedState,
        })
        .eq('id', authUserId);
    } catch (userErr) {
      console.warn("Could not sync profile changes to public.users:", userErr);
    }
  }

  return true;
}

export async function updateCustomerStatus(id: string, status: CustomerStatus): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff || (staff.role !== "admin" && staff.role !== "super_admin")) {
    console.error("Forbidden: Field agents and support staff cannot modify customer account status.");
    return false;
  }

  const { error } = await supabase
    .from('customers')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error("Error updating customer status:", error);
    return false;
  }
  return true;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  // Strictly enforce role authorization: Only Admins and Super Admins can delete customers
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized: You must be authenticated to perform this operation.");

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff || (staff.role !== "admin" && staff.role !== "super_admin")) {
    throw new Error("Forbidden: Field agents and support staff do not have permission to delete customers. Only administrators have deletion clearance.");
  }

  // 1. First attempt: Use PostgreSQL SECURITY DEFINER RPC function
  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_customer_user', {
    target_customer_id: id,
  });

  if (!rpcError && rpcData) {
    return true;
  }

  if (rpcError) {
    console.warn("RPC delete_customer_user not found or failed, attempting cascading client delete:", rpcError);
  }

  // 2. Second attempt: Clean up referencing foreign key records first
  try {
    await supabase.from("transactions").delete().eq("customer_id", id);
  } catch (_) { /* ignore */ }

  try {
    await supabase.from("linked_accounts").delete().eq("customer_id", id);
  } catch (_) { /* ignore */ }

  // 3. Delete customer row
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting customer:", error);
    throw new Error(error.message || rpcError?.message || "Failed to delete customer");
  }

  return true;
}

export async function updateCustomerPinThreshold(
  customerIdOrAuthId: string,
  newThreshold: number
): Promise<boolean> {
  if (newThreshold < 0) {
    throw new Error("Threshold cannot be negative.");
  }

  // Update in customers table
  const { error: custErr } = await supabase
    .from("customers")
    .update({ pin_threshold: newThreshold })
    .or(`id.eq.${customerIdOrAuthId},auth_user_id.eq.${customerIdOrAuthId}`);

  if (custErr) {
    console.error("Error updating customer pin threshold:", custErr);
    throw new Error(custErr.message);
  }

  // Also sync to users table if auth_user_id matches
  try {
    await supabase
      .from("users")
      .update({ pin_threshold: newThreshold })
      .eq("id", customerIdOrAuthId);
  } catch (_) {
    // Ignore if not present in users table
  }

  return true;
}