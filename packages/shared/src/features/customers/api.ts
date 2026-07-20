import { supabase } from "@biopay/shared/lib/supabase";
import type { Customer, CustomerDraft, CustomerStatus, PaginatedResult } from "@biopay/shared/types";

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
  const { data, error, count } = await query.range(start, start + pageSize - 1).order('created_at', { ascending: false });
  
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
    createdAt: row.created_at
  }));

  return { items: mappedItems, page, pageSize, totalCount: count || 0 };
}

export async function registerCustomer(
  draft: CustomerDraft
): Promise<{ customerId: string }> {
  if (draft.capturedFingers.length !== 4) {
    throw new Error("Exactly 4 fingers must be captured before registration.");
  }

  // Split name for DB
  const nameParts = draft.fullName.trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Unknown";
  
  const ninLast4 = draft.nin.slice(-4);

  const { data, error } = await supabase.from('customers').insert({
    first_name: firstName,
    last_name: lastName,
    phone: draft.phone,
    email: draft.email || null,
    nin_last_4: ninLast4,
    state: draft.state,
    status: 'active', // default active for prototype
    captured_fingers: draft.capturedFingers,
  }).select('id').single();

  if (error) {
    console.error("Error registering customer:", error);
    throw new Error(error.message);
  }

  return { customerId: data.id };
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
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting customer:", error);
    return false;
  }
  return true;
}