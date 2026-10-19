import { supabase } from "@milipay/shared/lib/supabase";

/**
 * Settings (design handoff, admin "Settings"): tier limits, self sign-up
 * rules, fees, security and integrations. Every save carries a reason and
 * is written to the audit log by the server.
 */

export interface TierRow {
  tier: 1 | 2 | 3;
  maxSingle: number;
  maxDaily: number;
  pinOver: number;
}

export interface PlatformSettings {
  tiers: TierRow[];
  security: { mfaRequired: boolean; idleSignOut: boolean };
  signup: { enabled: boolean; selfieAttempts: number; abandonHours: number };
  defaultMerchantFee: number;
  /** "aal2" when this session passed two-factor. */
  sessionAal: string;
}

/** vtu-service's margins: what MiliPay adds on top of the provider's price. */
export interface VtuFees {
  airtime_surcharge_percent: number;
  data_surcharge_ngn: number;
  power_convenience_fee_ngn: number;
  cable_surcharge_ngn: number;
}

export interface Integration {
  name: string;
  use: string;
  icon: string;
  status: string;
  tone: "ok" | "warn" | "info" | "muted";
  metric: string;
  mode: "LIVE" | "TEST" | "OFF";
}

async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export async function fetchSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase.rpc("admin_settings");
  if (error) throw new Error(error.message);
  const d = data as PlatformSettings;
  return { ...d, tiers: d.tiers.map((t) => ({ ...t, maxSingle: Number(t.maxSingle), maxDaily: Number(t.maxDaily), pinOver: Number(t.pinOver) })) };
}

export async function saveTierLimits(tiers: TierRow[], reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_save_tier_limits", { p_tiers: tiers, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function savePlatformSettings(group: "security" | "signup" | "merchant_fee", values: Record<string, unknown>, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_save_platform_settings", { p_group: group, p_values: values, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function fetchVtuFees(): Promise<VtuFees> {
  const { data, error } = await supabase.functions.invoke("vtu-service", { body: { action: "get_settings" } });
  if (error || !data?.settings) throw new Error(await functionError(error, "Could not load the service fees."));
  return data.settings as VtuFees;
}

export async function saveVtuFees(fees: Partial<VtuFees>, reason: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("vtu-service", { body: { action: "update_settings", ...fees, reason } });
  if (error || !data?.success) throw new Error(await functionError(error, "Could not save the service fees."));
}

export async function fetchIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase.functions.invoke("platform-status", { body: {} });
  if (error || !data?.success) throw new Error(await functionError(error, "Could not check the integrations."));
  return data.integrations as Integration[];
}

/** Settings › Integrations: one real SMS from Termii to the signed-in admin's own phone. */
export async function testTermii(): Promise<{ sent: boolean; detail: string }> {
  const { data, error } = await supabase.functions.invoke("platform-status", { body: { action: "test_termii" } });
  if (error || !data?.success) throw new Error(await functionError(error, "The test message wasn't sent."));
  return { sent: Boolean(data.sent), detail: String(data.detail ?? "") };
}

/** Where the Register merchant form starts its fee. */
export async function fetchDefaultMerchantFee(): Promise<number | null> {
  const { data, error } = await supabase.rpc("default_merchant_fee");
  return error || data === null ? null : Number(data);
}

// ── Rules for the forms ──────────────────────────────────────────────────

/** What's wrong with a tier table, or "" when it can be saved. */
export function tierError(rows: TierRow[]): string {
  for (const t of rows) {
    if (!(t.maxSingle > 0) || !(t.maxDaily > 0)) return `Tier ${t.tier}: every amount must be filled in.`;
    if (t.maxSingle > t.maxDaily) return `Tier ${t.tier}: the per-payment limit can't be more than the daily limit.`;
    if (t.pinOver > t.maxSingle) return `Tier ${t.tier}: the PIN amount can't be more than the per-payment limit.`;
    if (t.maxDaily > 5_000_000) return `Tier ${t.tier}: daily limit looks too high.`;
  }
  return "";
}

/** What's wrong with the self sign-up rules, or "". */
export function signupError(s: PlatformSettings["signup"]): string {
  if (s.selfieAttempts < 1 || s.selfieAttempts > 5) return "Allow between 1 and 5 selfie attempts.";
  if (s.abandonHours < 24 || s.abandonHours > 720) return "Abandon after between 24 and 720 hours.";
  return "";
}

/** The fee inputs, as typed. */
export interface FeeDraft {
  palm: string;
  airtime: string;
  data: string;
  electricity: string;
  cable: string;
}

export function feeError(f: FeeDraft): string {
  const palm = Number(f.palm);
  if (!(palm > 0 && palm <= 5)) return "The palm payment fee must be between 0 and 5%.";
  if (!(Number(f.airtime) >= 0 && Number(f.airtime) <= 100)) return "The airtime margin must be between 0 and 100%.";
  for (const [k, label] of [["data", "Data"], ["electricity", "Electricity"], ["cable", "Cable TV"]] as const) {
    const v = Number(f[k]);
    if (!(v >= 0 && v <= 10_000)) return `${label}: enter an amount between ₦0 and ₦10,000.`;
  }
  return "";
}
