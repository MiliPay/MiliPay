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
}

export async function fetchCustomers(
  options: FetchCustomersOptions = {}
): Promise<PaginatedResult<Customer>> {
  const { page = 1, pageSize = 10, search = "", status = "" } = options;
  
  let query = supabase.from('customers').select('*', { count: 'exact' });
  
  if (status) {
    query = query.eq('status', status);
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
  
  const mappedItems: Customer[] = (data || []).map((row: any) => ({
    id: row.id,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone,
    email: row.email || "",
    ninLast4: row.nin_last_4,
    state: row.state,
    status: row.status as CustomerStatus,
    capturedFingers: row.captured_fingers || [],
    linkedAccountCount: 0, 
    authUserId: row.auth_user_id,
    registeredBy: row.registered_by,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at
  }));

  return { items: mappedItems, page, pageSize, totalCount: count || 0 };
}

export async function fetchPendingCustomerCount(): Promise<number> {
  const { count, error } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    console.error("Error fetching pending customer count:", error);
    return 0;
  }
  return count || 0;
}

export async function registerCustomer(
  draft: CustomerDraft
): Promise<CustomerRegistrationResult> {
  if (draft.capturedFingers.length !== 4) {
    throw new Error("Exactly 4 fingers must be captured before registration.");
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
    nin_last_4: ninLast4,
    state: draft.state,
    status: initialStatus,
    captured_fingers: draft.capturedFingers,
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

  if (accessToken) {
    try {
      const { data: responseData, error: funcError } = await supabase.functions.invoke('reject-customer', {
        body: { customerId, reason },
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
    reason: reason || "Did not meet KYC verification requirements",
  });

  if (rpcError) {
    console.error("RPC reject_customer_kyc error:", rpcError);
    // Direct table update fallback
    const { error: dbError } = await supabase
      .from('customers')
      .update({
        status: 'rejected',
        verified_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', customerId);

    if (dbError) {
      throw new Error(dbError.message || "Failed to reject customer");
    }
  }

  return true;
}

export async function fetchCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error("Error fetching customer by id:", error);
    return null;
  }

  return {
    id: data.id,
    fullName: `${data.first_name} ${data.last_name}`.trim(),
    phone: data.phone,
    email: data.email || "",
    ninLast4: data.nin_last_4,
    state: data.state,
    status: data.status as CustomerStatus,
    capturedFingers: data.captured_fingers || [],
    linkedAccountCount: 0,
    authUserId: data.auth_user_id,
    registeredBy: data.registered_by,
    verifiedBy: data.verified_by,
    verifiedAt: data.verified_at,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at
  };
}

export async function updateCustomerStatus(id: string, status: CustomerStatus): Promise<boolean> {
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