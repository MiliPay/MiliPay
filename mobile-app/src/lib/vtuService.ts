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
  accountId?: string;
  pin?: string;
  reference?: string;
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

/** Retail bundle catalogue (VTPass) for data and cable. */
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
 * Execute a recharge.
 *
 * The Edge Function debits, fulfils and reverses atomically. On return we
 * re-read balances from the server rather than adjusting them locally, so the
 * UI can never disagree with the ledger.
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
      meterType: payload.meterType ?? 'prepaid',
      accountId: payload.accountId,
      pin: payload.pin,
      reference: payload.reference,
    },
  });

  const result = toResult(data, error);

  // Whatever happened, the server is the source of truth for the balance.
  const userId = useAuthStore.getState().user?.id;
  if (userId) {
    await useBankStore.getState().fetchAccounts(userId);
  }

  return result;
}
