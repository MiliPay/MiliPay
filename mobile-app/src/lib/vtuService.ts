import { supabase } from './supabase';
import { useBankStore, useAuthStore } from '../store/useStore';

/**
 * Thin client for the `vtu-service` Edge Function.
 *
 * This module deliberately holds NO operator credentials and performs NO
 * balance arithmetic. Pricing, debiting, fulfilment and reversal are all
 * server-side: anything decided here could be tampered with by repacking the
 * app.
 */

export interface DynamicVariation {
  id?: string;
  variation_code: string;
  name: string;
  validity: string;
  baseAmount: number;
  surcharge: number;
  price: number;
  fixedPrice?: boolean;
}

export type VtuServiceType = 'airtime' | 'data' | 'power' | 'cable';

/** Service types the platform can actually fulfil today. */
export const SUPPORTED_SERVICE_TYPES: VtuServiceType[] = ['airtime', 'data', 'power', 'cable'];

export function isSupportedServiceType(value: string): value is VtuServiceType {
  return (SUPPORTED_SERVICE_TYPES as string[]).includes(value);
}

export interface VtuRechargePayload {
  serviceType: string;
  provider: string;
  /** Only for open-value services (airtime, electricity). Bundles are priced server-side. */
  amount?: number;
  destination: string;
  customerPhone?: string;
  variationCode?: string;
  meterType?: 'prepaid' | 'postpaid';
  dataCategory?: 'sme' | 'direct';
  /** BigiSub plan shelf. 'sme' / 'direct' above are the legacy shorthand. */
  planType?: 'SME' | 'GIFTING' | 'DataTransfer' | 'SME2' | 'CGIFTING' | 'DataCOUPON' | 'SNS';
  /**
   * Electricity and cable only, and required: BigiSub's own endpoints demand
   * the verified account holder, so the purchase is refused without one rather
   * than failing at the gateway after the customer has paid.
   */
  customerName?: string;
  customerAddress?: string;
  accountId?: string;
  pin?: string;
  // reference is deliberately absent. The server owns it now: it used to be
  // accepted from here and generated only as a fallback, so a retry that
  // omitted it produced a fresh reference and a second charge.
}

export interface VtuRechargeResult {
  success: boolean;
  reference?: string;
  operatorReference?: string;
  amount?: number;
  serviceType?: string;
  provider?: string;
  beneficiary?: string;
  merchantTitle?: string;
  token?: string | null;
  units?: string | null;
  newBalance?: number;
  timestamp?: string;
  requirePin?: boolean;
  refunded?: boolean;
  code?: string;
  message?: string;
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const variationsCache = new Map<string, { data: DynamicVariation[]; timestamp: number }>();

export function normalizeNigerianPhone(phone?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/[^0-9+]/g, '');
  if (clean.startsWith('+234')) return '0' + clean.slice(4);
  if (clean.startsWith('234') && clean.length > 10) return '0' + clean.slice(3);
  return clean;
}

export function resolveBigisubNetworkId(telco: string): number {
  const t = (telco || '').toLowerCase().trim();
  if (t === 'airtel') return 2;
  if (t === 'glo') return 3;
  if (t === '9mobile' || t === 'etisalat') return 4;
  return 1;
}

/** Normalises the Edge Function's transport-level and body-level errors into one shape. */
function toResult(data: any, error: any): VtuRechargeResult {
  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError with the body attached.
    const body = (error as any)?.context?.body ?? (error as any)?.context;
    if (body && typeof body === 'object') {
      return { success: false, ...body };
    }
    return { success: false, error: error.message || 'Service temporarily unavailable' };
  }
  if (!data) {
    return { success: false, error: 'No response from payment service' };
  }
  return data as VtuRechargeResult;
}

/** Retail bundle catalogue for data and cable. */
export async function fetchDynamicVariations(
  serviceType: string,
  provider: string,
): Promise<DynamicVariation[]> {
  const cacheKey = `${serviceType}_${provider}`.toLowerCase();
  const cached = variationsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: { action: 'get_variations', serviceType, provider },
  });

  if (error || !data?.success || !Array.isArray(data.variations)) {
    // No hardcoded price list: showing a stale price the server will reject
    // just moves the failure to after the customer has committed.
    console.warn('[vtuService] variations unavailable', error ?? data);
    return [];
  }

  variationsCache.set(cacheKey, { data: data.variations, timestamp: Date.now() });
  return data.variations;
}

/** Wholesale SME data catalogue (BigiSub). */
export async function fetchSmeDataPlans(provider: string): Promise<DynamicVariation[]> {
  const networkId = resolveBigisubNetworkId(provider);
  const cacheKey = `sme_${networkId}`;
  const cached = variationsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: { action: 'get_sme_plans', network: networkId, provider },
  });

  if (error || !data?.success || !Array.isArray(data.plans)) {
    console.warn('[vtuService] SME plans unavailable', error ?? data);
    return [];
  }

  variationsCache.set(cacheKey, { data: data.plans, timestamp: Date.now() });
  return data.plans;
}

export interface VtuMargins {
  data_surcharge_ngn: number;
  cable_surcharge_ngn: number;
  power_convenience_fee_ngn: number;
  airtime_surcharge_percent: number;
}

const DEFAULT_MARGINS: VtuMargins = {
  data_surcharge_ngn: 25,
  cable_surcharge_ngn: 30,
  power_convenience_fee_ngn: 0,
  airtime_surcharge_percent: 0,
};

let cachedMargins: { value: VtuMargins; timestamp: number } | null = null;

/** Display-only: the server re-derives margins when it prices the transaction. */
export async function getActiveVtuMargins(): Promise<VtuMargins> {
  if (cachedMargins && Date.now() - cachedMargins.timestamp < CACHE_TTL_MS) {
    return cachedMargins.value;
  }

  try {
    const { data } = await supabase
      .from('vtu_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (data) {
      const value: VtuMargins = {
        data_surcharge_ngn: Number(data.data_surcharge_ngn) || 0,
        cable_surcharge_ngn: Number(data.cable_surcharge_ngn) || 0,
        power_convenience_fee_ngn: Number(data.power_convenience_fee_ngn) || 0,
        airtime_surcharge_percent: Number(data.airtime_surcharge_percent) || 0,
      };
      cachedMargins = { value, timestamp: Date.now() };
      return value;
    }
  } catch (err) {
    console.warn('[vtuService] could not read margins', err);
  }

  return DEFAULT_MARGINS;
}

/**
 * Start a purchase.
 *
 * This no longer waits for the airtime. It returns as soon as the transaction
 * is open and the customer's bank has been asked for the money — because the
 * bank confirms by webhook, which is a few real seconds later, and blocking
 * the UI on it would mean a spinner with nothing behind it.
 *
 * The caller takes the returned `reference` and watches it with
 * watchTransaction(). Success is NOT implied by this resolving.
 */
export async function executeVtuRecharge(
  payload: VtuRechargePayload,
): Promise<VtuRechargeResult> {
  if (!payload.accountId) {
    return { success: false, error: 'Select a linked bank account first', code: 'NO_ACCOUNT' };
  }

  if (!isSupportedServiceType(payload.serviceType)) {
    return {
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      error: `${payload.serviceType} payments are not available yet.`,
      message: `${payload.serviceType} payments are not available yet.`,
    };
  }

  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: {
      action: 'purchase',
      serviceType: payload.serviceType,
      provider: payload.provider,
      amount: payload.amount,
      destination: payload.destination,
      customerPhone: payload.customerPhone,
      variationCode: payload.variationCode,
      dataCategory: payload.dataCategory,
      planType: payload.planType,
      customerName: payload.customerName,
      customerAddress: payload.customerAddress,
      meterType: payload.meterType ?? 'prepaid',
      accountId: payload.accountId,
      pin: payload.pin,
    },
  });

  return toResult(data, error);
}

/**
 * Verify an electricity meter or a TV smartcard.
 *
 * Not optional and not merely a nicety: BigiSub's pay/purchase endpoints
 * require the account holder's name exactly as their own verify call returned
 * it. Skipping this means the purchase is rejected by the gateway AFTER the
 * customer's bank has been debited.
 *
 * It also lets the customer catch their own typo — they see whose meter they
 * are about to credit before any money moves.
 */
export async function verifyBillAccount(args: {
  serviceType: 'power' | 'cable';
  provider: string;
  destination: string;
  meterType?: 'prepaid' | 'postpaid';
}): Promise<
  | { success: true; customerName: string; customerAddress?: string | null; currentBouquet?: string | null }
  | { success: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: {
      action: args.serviceType === 'power' ? 'verify_meter' : 'verify_cable',
      provider: args.provider,
      destination: args.destination,
      meterType: args.meterType ?? 'prepaid',
    },
  });

  if (error || !data?.success) {
    return {
      success: false,
      error: data?.error ?? 'That account could not be verified. Check the number and try again.',
    };
  }

  return {
    success: true,
    customerName: String(data.customerName ?? ''),
    customerAddress: data.customerAddress ?? null,
    currentBouquet: data.currentBouquet ?? null,
  };
}

/** Electricity providers and the service charge each one levies. */
export async function fetchElectricityProviders(): Promise<
  { name: string; code: string; minAmount: number; serviceCharge: number; serviceChargeType: string }[]
> {
  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: { action: 'get_electricity_providers' },
  });
  if (error || !data?.success) return [];
  return data.providers ?? [];
}
