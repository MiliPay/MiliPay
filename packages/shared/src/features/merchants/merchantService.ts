import { supabase } from "@milipay/shared/lib/supabase";
import type {
  Merchant,
  POSTerminal,
  MerchantDraft,
  MerchantStatus,
  MerchantCredentials,
  MerchantTransaction,
} from "@milipay/shared/types";

export interface OnboardMerchantResult {
  merchantId: string;
  terminalId?: string;
  credentials?: MerchantCredentials;
}

// Common Nigerian commercial banks for settlement
export const NIGERIAN_SETTLEMENT_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Optimus Bank", code: "107" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "SunTrust Bank", code: "100" },
  { name: "Titan Trust Bank", code: "102" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
  { name: "Kuda Microfinance Bank", code: "50211" },
  { name: "OPay", code: "999992" },
  { name: "Palmpay", code: "999991" },
  { name: "Moniepoint MFB", code: "50515" },
] as const;

export const MERCHANT_CATEGORIES = [
  { label: "Supermarket & Groceries", value: "supermarket" },
  { label: "General Retail & Boutique", value: "retail" },
  { label: "Restaurant, Cafe & Dining", value: "dining" },
  { label: "Fuel Station & Auto", value: "fuel" },
  { label: "Pharmacy & Healthcare", value: "pharmacy" },
  { label: "Hospitality & Services", value: "services" },
  { label: "Other Business Category", value: "other" },
] as const;

export const HARDWARE_MODELS = [
  { label: "HFSecurity HP605PV (Smart Financial POS - EMV/PCI)", value: "HFSecurity HP605PV" },
  { label: "HFSecurity VP930Pro (Dual-Lens Countertop Scanner)", value: "HFSecurity VP930Pro" },
  { label: "HFSecurity MP50 (Handheld POS Terminal)", value: "HFSecurity MP50" },
  { label: "HFSecurity FP08PV (Field Agent Tablet)", value: "HFSecurity FP08PV" },
] as const;

export async function fetchMerchants(filter?: {
  search?: string;
  status?: string;
  category?: string;
}): Promise<Merchant[]> {
  let query = supabase
    .from("merchants")
    .select(`
      *,
      staff_profiles!merchants_onboarded_by_fkey(full_name, email, role),
      pos_terminals(id, is_active)
    `)
    .order("created_at", { ascending: false });

  if (filter?.status && filter.status !== "all") {
    query = query.eq("status", filter.status);
  }

  if (filter?.category && filter.category !== "all") {
    query = query.eq("category", filter.category);
  }

  if (filter?.search) {
    const s = filter.search.trim();
    query = query.or(`business_name.ilike.%${s}%,director_name.ilike.%${s}%,settlement_account_number.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching merchants:", error);
    throw error;
  }

  return (data || []).map((row: any) => {
    const terminals = row.pos_terminals || [];
    return {
      id: row.id,
      businessName: row.business_name,
      category: row.category,
      address: row.address,
      state: row.state,
      cacRcNumber: row.cac_rc_number,
      directorName: row.director_name,
      directorPhone: row.director_phone,
      directorBvn: row.director_bvn,
      email: row.email,
      authUserId: row.auth_user_id,
      settlementBankName: row.settlement_bank_name,
      settlementBankCode: row.settlement_bank_code,
      settlementAccountNumber: row.settlement_account_number,
      settlementAccountName: row.settlement_account_name,
      monoSubaccountId: row.mono_subaccount_id,
      platformFeePercent: Number(row.platform_fee_percent || 1.50),
      settlementSchedule: row.settlement_schedule || "instant",
      status: row.status as MerchantStatus,
      onboardedBy: row.onboarded_by,
      onboardedByName: row.staff_profiles?.full_name || "MiliPay Staff",
      onboardedByEmail: row.staff_profiles?.email,
      onboardedByRole: row.staff_profiles?.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      terminalCount: terminals.length,
      activeTerminalCount: terminals.filter((t: any) => t.is_active).length,
    };
  });
}

export async function fetchMerchantById(id: string): Promise<{
  merchant: Merchant;
  terminals: POSTerminal[];
}> {
  const { data: row, error } = await supabase
    .from("merchants")
    .select(`
      *,
      staff_profiles!merchants_onboarded_by_fkey(full_name, email, role),
      pos_terminals(
        *,
        staff_profiles!pos_terminals_assigned_by_fkey(full_name, email, role)
      )
    `)
    .eq("id", id)
    .single();

  if (error || !row) {
    throw new Error(error?.message || "Merchant not found");
  }

  const rawTerminals = row.pos_terminals || [];
  const terminals: POSTerminal[] = rawTerminals.map((t: any) => ({
    id: t.id,
    terminalId: t.terminal_id,
    merchantId: t.merchant_id,
    merchantName: row.business_name,
    deviceSerialNumber: t.device_serial_number,
    deviceModel: t.device_model,
    isActive: t.is_active,
    lastHeartbeat: t.last_heartbeat,
    assignedBy: t.assigned_by,
    assignedByName: t.staff_profiles?.full_name || "MiliPay Staff",
    assignedByEmail: t.staff_profiles?.email,
    assignedByRole: t.staff_profiles?.role,
    createdAt: t.created_at,
  }));

  const merchant: Merchant = {
    id: row.id,
    businessName: row.business_name,
    category: row.category,
    address: row.address,
    state: row.state,
    cacRcNumber: row.cac_rc_number,
    directorName: row.director_name,
    directorPhone: row.director_phone,
    directorBvn: row.director_bvn,
    email: row.email,
    authUserId: row.auth_user_id,
    settlementBankName: row.settlement_bank_name,
    settlementBankCode: row.settlement_bank_code,
    settlementAccountNumber: row.settlement_account_number,
    settlementAccountName: row.settlement_account_name,
    monoSubaccountId: row.mono_subaccount_id,
    platformFeePercent: Number(row.platform_fee_percent || 1.50),
    settlementSchedule: row.settlement_schedule || "instant",
    status: row.status as MerchantStatus,
    onboardedBy: row.onboarded_by,
    onboardedByName: row.staff_profiles?.full_name || "MiliPay Staff",
    onboardedByEmail: row.staff_profiles?.email,
    onboardedByRole: row.staff_profiles?.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    terminalCount: terminals.length,
    activeTerminalCount: terminals.filter((t) => t.isActive).length,
  };

  return { merchant, terminals };
}

/**
 * Onboard a merchant.
 *
 * The direct-insert fallback is gone. It wrote the merchant row from the
 * client, generated a fake mono_subaccount_id, and then reported credentials
 * of `draft.email` / "Password12$" — for an auth account it had never created.
 * Anyone handed those details could not log in, and the literal was a
 * guessable default wherever it did work.
 *
 * One path now: the Edge Function creates the login, generates the password
 * with crypto and sends it to the director's phone.
 */
export async function onboardMerchant(draft: MerchantDraft): Promise<OnboardMerchantResult> {
  const { data, error } = await supabase.functions.invoke("onboard-merchant", {
    body: draft,
  });

  if (error) {
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.error) throw new Error(String(body.error));
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message) throw parseErr;
      }
    }
    throw new Error(error instanceof Error ? error.message : "Failed to onboard merchant.");
  }

  if (!data?.success || !data?.merchant?.id) {
    throw new Error(data?.error || "Failed to onboard merchant.");
  }

  return {
    merchantId: data.merchant.id,
    terminalId: data.terminal?.terminal_id,
    credentials: data.credentials ?? undefined,
  };
}


/**
 * Merchant status, blacklisting and the platform fee all go through one
 * role-checked definer RPC.
 *
 * They used to be direct client updates against public.merchants, where
 * `authenticated` held unrestricted UPDATE and a policy let a merchant session
 * write its own row — so a merchant could set platform_fee_percent to 0, undo
 * their own blacklisting, or point settlements at a different bank account.
 * The client no longer holds UPDATE on that table at all.
 */
async function setMerchantControls(
  merchantId: string,
  controls: { status?: MerchantStatus; feePercent?: number }
): Promise<void> {
  const { data, error } = await supabase.rpc("admin_update_merchant_controls", {
    p_merchant_id: merchantId,
    p_status: controls.status ?? null,
    p_fee_percent: controls.feePercent ?? null,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "Could not update the merchant.");
}

export async function updateMerchantStatus(
  merchantId: string,
  status: MerchantStatus
): Promise<void> {
  await setMerchantControls(merchantId, { status });
}

export async function blacklistMerchant(
  merchantId: string,
  blacklist: boolean
): Promise<void> {
  const status: MerchantStatus = blacklist ? "blacklisted" : "active";
  await setMerchantControls(merchantId, { status });

  // Lock the attached terminals down immediately. This is a second statement
  // and could in principle fail on its own, but a blacklisted merchant already
  // cannot take payment: process-payment rejects any merchant whose status is
  // not 'active' before it looks at the palm. So a terminal left showing as
  // live here is a display concern, not an open till.
  if (blacklist) {
    const { error } = await supabase
      .from("pos_terminals")
      .update({ is_active: false })
      .eq("merchant_id", merchantId);

    if (error) {
      console.error("Merchant blacklisted but terminals were not deactivated:", error.message);
    }
  }
}

/**
 * Delete a merchant and everything hanging off it.
 *
 * The client-side cascade that used to run when the RPC failed has been
 * removed. It began by setting transactions.merchant_id = NULL for every
 * payment the merchant had ever taken — destroying the link between a payment
 * and who received it, which is exactly the record a payments system must keep
 * — and then deleted terminals and the merchant row in separate unatomic
 * statements. Since `authenticated` has no UPDATE on transactions, the first
 * step silently did nothing and the rest ran anyway, leaving orphans.
 *
 * The RPC does the whole cascade in one transaction. If it fails, nothing
 * happened, and that is the correct outcome.
 */
export async function deleteMerchant(merchantId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_merchant_cascade", {
    target_merchant_id: merchantId,
  });

  if (error) throw new Error(error.message || "Could not delete the merchant.");
}

export async function updateMerchantFee(
  merchantId: string,
  feePercent: number
): Promise<void> {
  await setMerchantControls(merchantId, { feePercent });
}

export async function fetchAllTerminals(): Promise<POSTerminal[]> {
  const { data, error } = await supabase
    .from("pos_terminals")
    .select(`
      *,
      merchants(id, business_name),
      staff_profiles!pos_terminals_assigned_by_fkey(full_name, email, role)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((t: any) => ({
    id: t.id,
    terminalId: t.terminal_id,
    merchantId: t.merchant_id,
    merchantName: t.merchants?.business_name || "Unassigned",
    deviceSerialNumber: t.device_serial_number,
    deviceModel: t.device_model,
    isActive: t.is_active,
    lastHeartbeat: t.last_heartbeat,
    assignedBy: t.assigned_by,
    assignedByName: t.staff_profiles?.full_name || "MiliPay Staff",
    assignedByEmail: t.staff_profiles?.email,
    assignedByRole: t.staff_profiles?.role,
    createdAt: t.created_at,
  }));
}

export async function toggleTerminalActive(
  terminalRecordId: string,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from("pos_terminals")
    .update({ is_active: isActive })
    .eq("id", terminalRecordId);

  if (error) throw error;
}

export async function bindNewTerminal(params: {
  merchantId: string;
  terminalId: string;
  deviceSerialNumber: string;
  deviceModel: string;
}): Promise<POSTerminal> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("pos_terminals")
    .insert({
      merchant_id: params.merchantId,
      terminal_id: params.terminalId,
      device_serial_number: params.deviceSerialNumber,
      device_model: params.deviceModel,
      is_active: true,
      assigned_by: user?.id || null,
    })
    .select(`
      *,
      merchants(business_name),
      staff_profiles!pos_terminals_assigned_by_fkey(full_name, email, role)
    `)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    terminalId: data.terminal_id,
    merchantId: data.merchant_id,
    merchantName: data.merchants?.business_name,
    deviceSerialNumber: data.device_serial_number,
    deviceModel: data.device_model,
    isActive: data.is_active,
    lastHeartbeat: data.last_heartbeat,
    assignedBy: data.assigned_by,
    assignedByName: data.staff_profiles?.full_name || "MiliPay Staff",
    assignedByEmail: data.staff_profiles?.email,
    assignedByRole: data.staff_profiles?.role,
    createdAt: data.created_at,
  };
}

export async function fetchMerchantTransactions(
  merchantId: string
): Promise<MerchantTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching merchant transactions:", error);
    throw error;
  }

  return (data || []).map((t: any) => {
    const amount = Number(t.amount || 0);
    const platformFee = Number(((amount * 1.5) / 100).toFixed(2));
    const netPayout = Number((amount - platformFee).toFixed(2));
    return {
      id: t.id,
      reference: t.reference || `TX-${t.id.slice(0, 8)}`,
      amount,
      platformFee,
      netPayout,
      terminalId: t.terminal_id,
      merchantId: t.merchant_id,
      merchantName: t.merchant_name || "Merchant Store",
      // A row with no status is a row we do not understand. Defaulting it to
      // "success" showed failed and pending payments as completed.
      status: t.status || "unknown",
      timestamp: t.created_at,
    };
  });
}

export async function fetchTerminalTransactions(
  terminalId: string
): Promise<MerchantTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("terminal_id", terminalId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching terminal transactions:", error);
    throw error;
  }

  return (data || []).map((t: any) => {
    const amount = Number(t.amount || 0);
    const platformFee = Number(((amount * 1.5) / 100).toFixed(2));
    const netPayout = Number((amount - platformFee).toFixed(2));
    return {
      id: t.id,
      reference: t.reference || `TX-${t.id.slice(0, 8)}`,
      amount,
      platformFee,
      netPayout,
      terminalId: t.terminal_id,
      merchantId: t.merchant_id,
      merchantName: t.merchant_name || "Merchant Store",
      // A row with no status is a row we do not understand. Defaulting it to
      // "success" showed failed and pending payments as completed.
      status: t.status || "unknown",
      timestamp: t.created_at,
    };
  });
}

export async function fetchCurrentMerchantProfile(): Promise<{
  merchant: Merchant;
  terminals: POSTerminal[];
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Query merchant record linked by auth_user_id or email
  const { data: row, error } = await supabase
    .from("merchants")
    .select("id")
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  if (error || !row) {
    throw new Error(error?.message || "No registered merchant account found matching your login credentials");
  }

  return fetchMerchantById(row.id);
}
