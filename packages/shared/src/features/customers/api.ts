import { supabase } from "@milipay/shared/lib/supabase";
import type { 
  Customer, 
  CustomerDraft, 
  CustomerStatus, 
  CustomerRegistrationResult, 
  PaginatedResult 
} from "@milipay/shared/types";
import type { IdentityVerificationResult } from "@milipay/shared/types";
import { isSimulatedTemplate, isSimulationEnabled } from "@milipay/shared/features/biometrics/palmScanner";
import { isSimulatedFaceTemplate } from "@milipay/shared/features/biometrics/faceScanner";

/**
 * Supabase wraps a non-2xx Edge Function reply in a FunctionsHttpError whose
 * message is always "Edge Function returned a non-2xx status code". The useful
 * part is the response body, which carries our ApiError message and code.
 */
async function readFunctionError(error: unknown, fallback: string): Promise<string> {
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
 * Columns a portal session is allowed to read.
 *
 * The raw NIN and BVN, the palm-vein and facial templates and the PIN hash are
 * withheld at the column level by migration 20260921000000, so `select('*')`
 * now fails outright. has_palm_template / has_face_template are generated
 * columns that answer "is one on file?" without exposing the template.
 */
const CUSTOMER_COLUMNS = [
  "id", "first_name", "last_name", "phone", "email", "address", "state",
  "nin_last_4", "bvn_last_4", "date_of_birth", "gender",
  "status", "kyc_tier", "pin_threshold", "single_limit", "daily_limit",
  "nin_verified", "nin_verified_at", "bvn_verified", "bvn_verified_at",
  "face_captured_at", "face_simulated", "palm_simulated",
  "has_palm_template", "has_face_template",
  "must_change_password", "password_changed_at", "biometric_enrolled_at",
  "onboarding_completed_at", "password_delivery_channel",
  "password_delivery_status", "password_delivered_at",
  "auth_user_id", "registered_by", "verified_by", "verified_at",
  "rejection_reason", "created_at",
].join(", ");

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
  
  let query = supabase.from('customers').select(CUSTOMER_COLUMNS, { count: 'exact' });
  
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
      hasPalmTemplate: Boolean(row.has_palm_template),
      hasFaceTemplate: Boolean(row.has_face_template),
      palmSimulated: Boolean(row.palm_simulated),
      faceSimulated: Boolean(row.face_simulated),
      ninVerified: Boolean(row.nin_verified),
      bvnVerified: Boolean(row.bvn_verified),
      bvnLast4: row.bvn_last_4 || undefined,
      dateOfBirth: row.date_of_birth || undefined,
      gender: row.gender || undefined,
      singleLimit: row.single_limit === null ? undefined : Number(row.single_limit),
      dailyLimit: row.daily_limit === null ? undefined : Number(row.daily_limit),
      passwordDeliveryChannel: row.password_delivery_channel || undefined,
      passwordDeliveryStatus: row.password_delivery_status || undefined,
      passwordDeliveredAt: row.password_delivered_at || undefined,
      mustChangePassword: Boolean(row.must_change_password),
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

/**
 * Agent / administrator enrolment.
 *
 * Everything security-relevant — status, KYC tier, NIN verification — is
 * decided by the enrol-customer Edge Function. The portal no longer writes
 * public.customers directly, because the RLS insert policy checked only who
 * the caller was and not what they were writing: an agent could post
 * status:'active' and skip approval entirely.
 */
export async function registerCustomer(
  draft: CustomerDraft
): Promise<CustomerRegistrationResult> {
  if (!draft.palmVeinTemplate) {
    throw new Error("Palm vein scan is required before registration.");
  }
  if (!draft.faceTemplate) {
    throw new Error("Facial capture is required before registration.");
  }

  // A simulated capture belongs to nobody. The Edge Function refuses these too;
  // this is the early, friendlier failure.
  const simulated =
    isSimulatedTemplate(draft.palmVeinTemplate) || isSimulatedFaceTemplate(draft.faceTemplate);
  if (simulated && !isSimulationEnabled()) {
    throw new Error(
      "This capture was simulated and cannot be used to enrol a customer. " +
        "Connect the enrolment hardware and capture again."
    );
  }

  const { data, error } = await supabase.functions.invoke("enrol-customer", {
    body: {
      fullName: draft.fullName.trim(),
      dateOfBirth: draft.dateOfBirth,
      gender: draft.gender,
      nin: draft.nin.trim(),
      bvn: draft.bvn?.trim() || undefined,
      phone: draft.phone.trim(),
      email: draft.email?.trim() || undefined,
      address: draft.address.trim(),
      state: draft.state,
      palmVeinTemplate: draft.palmVeinTemplate,
      // Absent on agent shells still running the v1 bridge. The Edge Function
      // treats it as optional and falls back to the legacy column.
      palm: draft.palmEnrolment
        ? {
            irFeatures: draft.palmEnrolment.irFeatures,
            rgbFeatures: draft.palmEnrolment.rgbFeatures,
            skeleton: draft.palmEnrolment.skeleton,
            hashIr: draft.palmEnrolment.hashIr,
            hashRgb: draft.palmEnrolment.hashRgb,
            palmType: draft.palmEnrolment.palmType,
            recogMode: draft.palmEnrolment.recogMode,
            algorithmVersion: draft.palmEnrolment.algorithmVersion,
            featureDim: draft.palmEnrolment.featureDim,
            qualityScore: draft.palmEnrolment.qualityScore,
            captureResult: draft.palmEnrolment.captureResult,
          }
        : undefined,
      faceTemplate: draft.faceTemplate,
    },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Registration failed."));
  }
  if (!data?.customerId) {
    throw new Error(data?.error || "Registration failed.");
  }

  return {
    customerId: data.customerId,
    status: data.status,
    requiresAdminVerification: Boolean(data.requiresAdminVerification),
    kycTier: data.kycTier,
    ninVerified: Boolean(data.ninVerified),
    ninVerificationMode: data.ninVerificationMode,
    bvnVerified: Boolean(data.bvnVerified),
  };
}

/**
 * Pre-submit NIN / BVN check, so the agent gets an answer before the review
 * step. Advisory only: enrol-customer re-runs it server-side.
 */
export async function verifyCustomerIdentity(params: {
  idType: "nin" | "bvn";
  idNumber: string;
  claimedName: string;
  customerId?: string;
}): Promise<IdentityVerificationResult> {
  const { data, error } = await supabase.functions.invoke("verify-identity", {
    body: params,
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Identity check failed."));
  }

  return {
    verificationId: data.verificationId,
    status: data.status,
    mode: data.mode,
    simulated: Boolean(data.simulated),
    matchedName: data.matchedName ?? null,
    failureReason: data.failureReason ?? null,
  };
}

export interface ApprovalResult {
  success: boolean;
  /** Whether the one-time password reached the customer. */
  delivered: boolean;
  deliveryChannel: "whatsapp" | "sms" | null;
  message: string;
}

/**
 * Approve a pending enrolment.
 *
 * Three things are deliberately absent compared with the previous version:
 * there is no customPassword argument (the portal was passing the
 * administrator's own user id into it, making that UUID the password of every
 * customer they approved), the password is not returned, and there is no RPC
 * or direct-table fallback — a fallback that only flipped `status` used to
 * report the literal "Password12$" as the customer's password.
 */
export async function approveCustomer(customerId: string): Promise<ApprovalResult> {
  const { data, error } = await supabase.functions.invoke("approve-customer", {
    body: { customerId, action: "approve" },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Failed to approve customer."));
  }
  if (!data?.success) {
    throw new Error(data?.error || "Failed to approve customer.");
  }

  return {
    success: true,
    delivered: Boolean(data.delivered),
    deliveryChannel: data.deliveryChannel ?? null,
    message: data.message ?? "Customer approved.",
  };
}

/** Reissue a fresh one-time password for a customer who never received theirs. */
export async function resendCustomerCredentials(customerId: string): Promise<ApprovalResult> {
  const { data, error } = await supabase.functions.invoke("approve-customer", {
    body: { customerId, action: "resend" },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Failed to resend credentials."));
  }
  if (!data?.success) {
    throw new Error(data?.error || "Failed to resend credentials.");
  }

  return {
    success: true,
    delivered: Boolean(data.delivered),
    deliveryChannel: data.deliveryChannel ?? null,
    message: data.message ?? "Credentials resent.",
  };
}

export async function rejectCustomer(customerId: string, reason: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("reject-customer", {
    body: { customerId, reason: reason.trim() || undefined },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Failed to reject customer."));
  }
  if (!data?.success) {
    throw new Error(data?.error || "Failed to reject customer.");
  }

  return true;
}


export async function fetchCustomerById(id: string): Promise<Customer | null> {
  const { data: row, error } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('id', id)
    .single();

  if (error || !row) {
    console.error("Error fetching customer by id:", error);
    return null;
  }

  const data = row as any;

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
    hasPalmTemplate: Boolean(data.has_palm_template),
    hasFaceTemplate: Boolean(data.has_face_template),
    palmSimulated: Boolean(data.palm_simulated),
    faceSimulated: Boolean(data.face_simulated),
    ninVerified: Boolean(data.nin_verified),
    bvnVerified: Boolean(data.bvn_verified),
    bvnLast4: data.bvn_last_4 || undefined,
    dateOfBirth: data.date_of_birth || undefined,
    gender: data.gender || undefined,
    singleLimit: data.single_limit === null ? undefined : Number(data.single_limit),
    dailyLimit: data.daily_limit === null ? undefined : Number(data.daily_limit),
    passwordDeliveryChannel: data.password_delivery_channel || undefined,
    passwordDeliveryStatus: data.password_delivery_status || undefined,
    passwordDeliveredAt: data.password_delivered_at || undefined,
    mustChangePassword: Boolean(data.must_change_password),
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
}): Promise<boolean> {
  // authUserId used to be taken here only to mirror the write into
  // public.users. That table is gone, so the caller no longer needs to pass it.
  const { id, firstName, lastName, phone, email, address, state } = params;

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

  // The dual-sync write to public.users that used to follow has been removed.
  // That table modelled the same human as public.customers, always held zero
  // rows, and the write was wrapped in an ignored catch — silent dead weight
  // that forced every read path to check two tables. Dropped in 20260921120000.

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

  return true;
}