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
  /**
   * Electricity and cable only, and required. The customer must have seen
   * whose meter or card they are crediting while a typo was still free to fix;
   * the server re-verifies before it prices the purchase either way.
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
  /** What the customer is charged, fees included. */
  amount?: number;
  /** The value bought (airtime, meter amount, plan) before fees. */
  baseAmount?: number;
  serviceCharge?: number;
  serviceType?: string;
  provider?: string;
  beneficiary?: string;
  merchantTitle?: string;
  /**
   * Present only in Mono's one-off DirectPay mode, where the customer has to
   * authorise this specific debit at their bank. Nothing is confirmed until
   * they do, so the app must open it — ignoring it leaves the transaction at
   * `initiated` for ever.
   */
  authorisationUrl?: string | null;
  /**
   * How the money is being taken: 'mandate' is quick pay (nothing more for
   * the customer to do), 'directpay' is an approval at their bank.
   */
  paymentRoute?: 'mandate' | 'directpay';
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
const variationsCache = new Map<string, { data: DynamicVariation[]; popular: string[]; timestamp: number }>();

export function normalizeNigerianPhone(phone?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/[^0-9+]/g, '');
  if (clean.startsWith('+234')) return '0' + clean.slice(4);
  if (clean.startsWith('234') && clean.length > 10) return '0' + clean.slice(3);
  return clean;
}

/**
 * Normalises the Edge Function's transport-level and body-level errors into
 * one shape.
 *
 * The error branch is the part that matters. supabase-js does NOT parse the
 * body of a non-2xx response — it throws FunctionsHttpError whose `context` is
 * the raw, unread `Response`. Reading `context.body` yields a ReadableStream,
 * and spreading one produces an object carrying none of the server's fields.
 *
 * That is how every distinct failure on the purchase screen — "quick services
 * are switched off", "too many requests", "PIN required", "your bank declined
 * this" — arrived as the same empty object and was shown to the customer as
 * the generic "Transaction could not be completed." It also meant `requirePin`
 * never survived the trip, so a mistyped PIN could not be retried: the server
 * asked for one and the app never heard the question.
 *
 * The body has to be read with .json(), which is why this is async. It can
 * only be read once, so nothing else may touch the response first.
 */
async function unwrap(data: any, error: any): Promise<VtuRechargeResult> {
  if (!error) {
    if (!data) return { success: false, error: 'No response from payment service' };
    return data as VtuRechargeResult;
  }

  const response = (error as any)?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (body && typeof body === 'object') {
        // The server already sets success:false on every error body; this is
        // belt and braces so a malformed one can never read as a success.
        return { ...body, success: false };
      }
    } catch {
      // Not JSON, or already consumed. Fall through to the transport message.
    }
  }

  return { success: false, error: error?.message || 'Service temporarily unavailable' };
}

export interface PlanCatalogue {
  plans: DynamicVariation[];
  /**
   * Variation codes customers on this network bought most recently — the
   * design's "Popular" badge and Hot tab. Empty until there are real sales.
   */
  popular: string[];
}

/** Retail bundle catalogue for data and cable, with what sells most. */
export async function fetchPlanCatalogue(serviceType: string, provider: string): Promise<PlanCatalogue> {
  const cacheKey = `${serviceType}_${provider}`.toLowerCase();
  const cached = variationsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { plans: cached.data, popular: cached.popular };
  }

  const { data, error } = await supabase.functions.invoke('vtu-service', {
    body: { action: 'get_variations', serviceType, provider },
  });

  if (error || !data?.success || !Array.isArray(data.variations)) {
    // No hardcoded price list: showing a stale price the server will reject
    // just moves the failure to after the customer has committed.
    console.warn('[vtuService] variations unavailable', error ?? data);
    return { plans: [], popular: [] };
  }

  const popular: string[] = Array.isArray(data.popular) ? data.popular.map(String) : [];
  variationsCache.set(cacheKey, { data: data.variations, popular, timestamp: Date.now() });
  return { plans: data.variations, popular };
}

/** The catalogue alone, for callers that do not show popularity. */
export async function fetchDynamicVariations(serviceType: string, provider: string): Promise<DynamicVariation[]> {
  return (await fetchPlanCatalogue(serviceType, provider)).plans;
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
      customerName: payload.customerName,
      customerAddress: payload.customerAddress,
      meterType: payload.meterType ?? 'prepaid',
      accountId: payload.accountId,
      pin: payload.pin,
    },
  });

  return await unwrap(data, error);
}

/**
 * Verify an electricity meter or a TV smartcard.
 *
 * Not optional and not merely a nicety: it returns the biller's own minimum,
 * which we would otherwise be guessing at, and the server refuses to price a
 * power or cable purchase without it.
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

  // Same trap as unwrap() above: on a non-2xx, `data` is null and the reason
  // the provider gave lives in the unread response body. Reading it is the
  // difference between "That account could not be verified" and "Meter number
  // not found on IKEDC".
  if (error) {
    const failed = await unwrap(null, error);
    return {
      success: false,
      error:
        failed.error ??
        failed.message ??
        'That account could not be verified. Check the number and try again.',
    };
  }

  if (!data?.success) {
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
