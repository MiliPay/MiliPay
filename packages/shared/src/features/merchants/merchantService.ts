import { supabase } from "@milipay/shared/lib/supabase";
import type { Merchant, POSTerminal, MerchantStatus, MerchantCredentials, MerchantTransaction } from "@milipay/shared/types";
import type { onboardingBody } from "./register";

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

export async function fetchMerchantById(id: string): Promise<{
  merchant: Merchant;
  terminals: POSTerminal[];
}> {
  const { data, error } = await supabase
    .from("merchants")
    // Named columns: the director's BVN and the terminal key hash are not
    // readable from the portals (20261003120000), so "*" would be refused.
    .select(`
      id, business_name, category, address, state, cac_rc_number, director_name, director_phone, email, auth_user_id,
      settlement_bank_name, settlement_bank_code, settlement_account_number, settlement_account_name, mono_subaccount_id,
      platform_fee_percent, settlement_schedule, status, onboarded_by, created_at, updated_at,
      staff_profiles!merchants_onboarded_by_fkey(full_name, email, role),
      pos_terminals(
        id, terminal_id, merchant_id, device_serial_number, device_model, is_active, last_heartbeat, assigned_by, created_at,
        staff_profiles!pos_terminals_assigned_by_fkey(full_name, email, role)
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Merchant not found");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the embedded rows are mapped field by field below
  const row = data as any;

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
export async function onboardMerchant(body: ReturnType<typeof onboardingBody>): Promise<OnboardMerchantResult> {
  const { data, error } = await supabase.functions.invoke("onboard-merchant", { body });

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
 * Ask the bank (through Mono, in onboard-merchant) whose name a settlement
 * account is in. null when the bank can't be asked right now.
 */
export async function resolveSettlementAccount(bankCode: string, accountNumber: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("onboard-merchant", {
    body: { action: "resolve_account", bankCode, accountNumber },
  });
  if (error || !data?.success) return null;
  return typeof data.name === "string" ? data.name : null;
}

/**
 * Turn a terminal off or back on. Administrators only, with a reason for the
 * audit log (admin_set_terminal_active); there is no direct write any more.
 */
export async function toggleTerminalActive(terminalRecordId: string, isActive: boolean, reason = ""): Promise<void> {
  const { error } = await supabase.rpc("admin_set_terminal_active", {
    p_id: terminalRecordId,
    p_active: isActive,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
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
