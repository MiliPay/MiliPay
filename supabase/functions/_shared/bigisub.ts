/**
 * BigiSub — the single fulfilment gateway.
 *
 * Verified against their OpenAPI 3.0.3 spec (Bigisub API 2.2.0,
 * https://rif.africa/api-specs/bigisub-v2.json), not guessed. VTPass is gone.
 *
 * Auth is Django token: `Authorization: Token <token>`.
 * Amounts are NAIRA throughout — BigiSub does not use kobo. Only Mono does,
 * and that conversion lives in money.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONSTRAINT THAT SHAPES EVERYTHING HERE
 *
 * No purchase endpoint accepts a client-supplied reference or idempotency
 * key. BigiSub generates `transaction_id` and hands it back. There is also no
 * endpoint that lists transactions — only `GET /anubis/transactions/{id}/`,
 * which needs an id we can only have got from a successful response.
 *
 * Therefore: A PURCHASE CALL IS NEVER RETRIED. Not on timeout, not on a
 * network error, not ever. A retry is a second independent purchase, and the
 * customer would be charged once and credited twice, at MiliPay's cost.
 *
 * When a call does not return cleanly, the transaction goes to
 * fulfilment_pending with no operator reference, and it is resolved by a human
 * against the BigiSub dashboard. That is deliberately uncomfortable, because
 * the alternative silently loses money.
 *
 * (VTPass had request_id for exactly this, which is the one thing it did
 * better. Worth asking BigiSub for an idempotency key — it would let these
 * resolve automatically.)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Endpoints in the spec we do not use yet: recharge pins, Smile/Spectranet
 * ISP top-ups, exam result checkers, betting, bulk SMS, marketing. The
 * mobile app's "internet" and "education" tiles map onto the ISP and
 * result-checker endpoints when we get to them.
 */

export class FulfilmentError extends Error {
  constructor(
    message: string,
    /** True when we do not know the outcome. NEVER means "safe to retry". */
    readonly indeterminate = false,
  ) {
    super(message);
    this.name = "FulfilmentError";
  }
}

export interface Variation {
  id: string;
  variation_code: string;
  name: string;
  validity: string;
  baseAmount: number;
  surcharge: number;
  price: number;
  fixedPrice: boolean;
}

/** What a purchase call tells us. `status` is BigiSub's own vocabulary. */
export interface Fulfilment {
  operatorReference: string;
  /** BigiSub's transaction_id — the only handle for a later requery. */
  tranxId: string | null;
  providerStatus: string;
  token?: string;
  units?: string;
  /** Provider's own charge, where it levies one (electricity, cable). */
  serviceCharge?: number;
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

export const NETWORKS: Record<string, number> = {
  mtn: 1,
  airtel: 2,
  glo: 3,
  "9mobile": 4,
  etisalat: 4,
};

export function networkId(provider: string): number | null {
  return NETWORKS[String(provider).toLowerCase().trim()] ?? null;
}

/** Plan types BigiSub exposes. "SME" is one of several, not a synonym for data. */
export type PlanType = "SME" | "GIFTING" | "DataTransfer" | "SME2" | "CGIFTING" | "DataCOUPON" | "SNS";

export const CABLE_PROVIDERS = ["dstv", "gotv", "startimes", "showmax"] as const;
export type CableProvider = (typeof CABLE_PROVIDERS)[number];

function config(): { baseUrl: string; token: string; pin: string } | null {
  const token = Deno.env.get("BIGISUB_API_TOKEN");
  const pin = Deno.env.get("BIGISUB_TRANSACTION_PIN");
  if (!token || !pin) return null;
  return {
    baseUrl: (Deno.env.get("BIGISUB_BASE_URL") || "https://api.bigisub.ng").replace(/\/+$/, ""),
    token,
    pin,
  };
}

export function isConfigured(): boolean {
  return config() !== null;
}

export function normalizeNigerianPhone(phone?: string): string {
  if (!phone) return "";
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.startsWith("+234")) return "0" + clean.slice(4);
  if (clean.startsWith("234") && clean.length > 10) return "0" + clean.slice(3);
  return clean;
}

interface CallArgs {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs?: number;
  /**
   * Set on calls that move value. A failure on one of these is INDETERMINATE:
   * BigiSub may have fulfilled it. Read-only calls are safe to fail loudly.
   */
  movesValue?: boolean;
}

async function call<T>(args: CallArgs): Promise<T> {
  const cfg = config();
  if (!cfg) throw new FulfilmentError("Fulfilment gateway is not configured. No value was moved.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);

  try {
    const res = await fetch(`${cfg.baseUrl}${args.path}`, {
      method: args.method ?? "POST",
      headers: {
        "Authorization": `Token ${cfg.token}`,
        "Accept": "application/json",
        ...(args.body ? { "Content-Type": "application/json" } : {}),
      },
      body: args.body ? JSON.stringify({ ...args.body, pin: cfg.pin }) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: Record<string, unknown>;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new FulfilmentError("Gateway returned an unreadable response", args.movesValue === true);
    }

    if (!res.ok) {
      const message =
        (typeof payload.message === "string" && payload.message) ||
        (typeof payload.detail === "string" && payload.detail) ||
        `Gateway responded ${res.status}`;
      // A 4xx on a value-moving call is a genuine refusal — the request never
      // reached fulfilment. A 5xx might have.
      throw new FulfilmentError(message, args.movesValue === true && res.status >= 500);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof FulfilmentError) throw err;
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new FulfilmentError(
      timedOut ? "Gateway timed out" : "Could not reach the fulfilment gateway",
      // We asked it to move value and never heard back. Outcome unknown.
      args.movesValue === true,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// Wallet — checked before the customer's bank is ever touched
// ─────────────────────────────────────────────────────────────

export interface WalletBalance {
  /** Naira. */
  balance: number;
  pending: number;
  accountName: string | null;
  reservedAccountNumber: string | null;
  bankName: string | null;
}

/**
 * A purchase spends MiliPay's pre-funded BigiSub balance. The customer's money
 * arrives separately, through Mono. If this wallet is empty we would take the
 * customer's money and be unable to deliver, so it is read BEFORE leg 1.
 *
 * Returns null when the balance cannot be determined — unknown is not zero,
 * and blocking every sale because BigiSub is briefly slow would be its own
 * kind of outage.
 */
export async function walletBalance(): Promise<WalletBalance | null> {
  try {
    const payload = await call<{ data?: Record<string, unknown> }>({
      path: "/api/v2/financial/wallet/balance/",
      method: "GET",
      timeoutMs: 5_000,
    });
    const data = payload.data ?? {};
    const balance = Number(data.balance);
    if (!Number.isFinite(balance)) return null;
    return {
      balance,
      pending: Number(data.pending_amount) || 0,
      accountName: typeof data.account_name === "string" ? data.account_name : null,
      reservedAccountNumber:
        typeof data.reserved_account_number === "string" ? data.reserved_account_number : null,
      bankName: typeof data.bank_name === "string" ? data.bank_name : null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Catalogues
// ─────────────────────────────────────────────────────────────

export async function listDataPlans(
  network: number,
  planType: PlanType,
  surcharge: number,
): Promise<Variation[]> {
  const payload = await call<{ data?: Record<string, unknown>[] }>({
    path: `/api/v2/vtu/data/plans/?network=${network}&plantype=${encodeURIComponent(planType)}`,
    method: "GET",
    timeoutMs: 8_000,
  });

  return (payload.data ?? [])
    .filter((p) => !p.plan_disabled)
    .map((p, idx) => {
      const baseAmount = Number(p.amount ?? p.plan_amount) || 0;
      return {
        id: `${planType.toLowerCase()}_${p.network}_${p.id}_${idx}`,
        variation_code: String(p.id),
        name: `${p.size} (${p.plantype ?? planType})`,
        validity: String(p.validity ?? "30 days"),
        baseAmount,
        surcharge,
        price: Math.ceil(baseAmount + surcharge),
        fixedPrice: true,
      };
    });
}

export async function listCablePlans(cableName: CableProvider, surcharge: number): Promise<Variation[]> {
  const payload = await call<{ data?: Record<string, unknown>[] }>({
    path: `/api/v2/vtu/cable/plans/?cable_name=${encodeURIComponent(cableName)}`,
    method: "GET",
    timeoutMs: 8_000,
  });

  return (payload.data ?? []).map((p, idx) => {
    const baseAmount = Number(p.amount) || 0;
    return {
      id: `cable_${cableName}_${p.id}_${idx}`,
      variation_code: String(p.variation_code ?? p.id),
      name: String(p.product_name ?? "Bouquet"),
      validity: "1 month",
      baseAmount,
      surcharge,
      price: Math.ceil(baseAmount + surcharge),
      fixedPrice: true,
    };
  });
}

export interface ElectricityProvider {
  name: string;
  code: string;
  minAmount: number;
  serviceCharge: number;
  serviceChargeType: string;
}

export async function listElectricityProviders(): Promise<ElectricityProvider[]> {
  const payload = await call<{ data?: { providers?: Record<string, unknown>[] } }>({
    path: "/api/v2/bills/electricity/providers/",
    method: "GET",
    timeoutMs: 8_000,
  });
  return (payload.data?.providers ?? []).map((p) => ({
    name: String(p.name ?? ""),
    code: String(p.code ?? ""),
    minAmount: Number(p.min_amount) || 0,
    serviceCharge: Number(p.service_charge) || 0,
    serviceChargeType: String(p.service_charge_type ?? "fixed"),
  }));
}

// ─────────────────────────────────────────────────────────────
// Verification — required before cable and electricity purchases
// ─────────────────────────────────────────────────────────────

export interface MeterVerification {
  customerName: string;
  customerAddress: string | null;
  meterNumber: string;
  disco: string;
}

export async function verifyMeter(args: {
  company: string;
  meterNo: string;
  meterType: "prepaid" | "postpaid";
}): Promise<MeterVerification> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/bills/electricity/verify/",
    body: { company: args.company, meter_no: args.meterNo, meter_type: args.meterType },
    timeoutMs: 12_000,
  });
  const data = payload.data ?? {};
  if (!data.customer_name) throw new FulfilmentError("That meter could not be verified.");
  return {
    customerName: String(data.customer_name),
    customerAddress: typeof data.customer_address === "string" ? data.customer_address : null,
    meterNumber: String(data.meter_number ?? args.meterNo),
    disco: String(data.disco ?? args.company),
  };
}

export interface CableVerification {
  valid: boolean;
  customerName: string;
  currentBouquet: string | null;
  cardNumber: string;
}

export async function verifyCable(args: {
  cableName: CableProvider;
  cardNo: string;
}): Promise<CableVerification> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/vtu/cable/verify/",
    body: { cable_name: args.cableName, card_no: args.cardNo },
    timeoutMs: 12_000,
  });
  const data = payload.data ?? {};
  if (data.valid === false || !data.customer_name) {
    throw new FulfilmentError("That smartcard number could not be verified.");
  }
  return {
    valid: true,
    customerName: String(data.customer_name),
    currentBouquet: typeof data.current_bouquet === "string" ? data.current_bouquet : null,
    cardNumber: String(data.card_number ?? args.cardNo),
  };
}

// ─────────────────────────────────────────────────────────────
// Purchases — CALLED EXACTLY ONCE. Never retried. See the header.
// ─────────────────────────────────────────────────────────────

function toFulfilment(data: Record<string, unknown>): Fulfilment {
  return {
    operatorReference: String(data.reference ?? data.transaction_id ?? `BGS-${Date.now()}`),
    tranxId: data.transaction_id ? String(data.transaction_id) : null,
    providerStatus: String(data.status ?? ""),
    token: typeof data.token === "string" && data.token ? data.token : undefined,
    units: typeof data.units === "string" && data.units ? data.units : undefined,
    serviceCharge: Number.isFinite(Number(data.service_charge))
      ? Number(data.service_charge)
      : undefined,
  };
}

export async function purchaseAirtime(args: {
  network: number;
  phone: string;
  /** Naira. */
  amount: number;
  airtimeType?: "vtu" | "share-and-sell";
}): Promise<Fulfilment> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/vtu/airtime/purchase/",
    movesValue: true,
    body: {
      network: args.network,
      phone_number: args.phone,
      amount: String(args.amount),
      airtime_type: args.airtimeType ?? "vtu",
    },
  });
  return toFulfilment(payload.data ?? {});
}

export async function purchaseData(args: {
  network: number;
  planId: number;
  phone: string;
  portedNumber?: boolean;
}): Promise<Fulfilment> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/vtu/data/purchase/",
    movesValue: true,
    body: {
      network: args.network,
      plan: args.planId,
      phone_number: args.phone,
      ported_number: args.portedNumber ?? true,
    },
  });
  return toFulfilment(payload.data ?? {});
}

export async function purchaseCable(args: {
  cableType: CableProvider;
  cardNo: string;
  phone: string;
  /** Naira. */
  amount: number;
  /** From verifyCable. The API requires it. */
  customerName: string;
}): Promise<Fulfilment> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/vtu/cable/purchase/",
    movesValue: true,
    body: {
      cable_type: args.cableType,
      card_no: args.cardNo,
      phone_number: args.phone,
      amount: args.amount,
      Customer: args.customerName,
    },
  });
  return toFulfilment(payload.data ?? {});
}

export async function payElectricity(args: {
  company: string;
  meterNo: string;
  meterType: "prepaid" | "postpaid";
  phone: string;
  /** Naira. */
  amount: number;
  /** From verifyMeter. The API requires it. */
  customerName: string;
  customerAddress?: string | null;
}): Promise<Fulfilment> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: "/api/v2/bills/electricity/pay/",
    movesValue: true,
    body: {
      company: args.company,
      meter_no: args.meterNo,
      meter_type: args.meterType,
      phone_number: args.phone,
      amount: args.amount,
      Customer_name: args.customerName,
      Customer_address: args.customerAddress ?? undefined,
    },
  });
  return toFulfilment(payload.data ?? {});
}

// ─────────────────────────────────────────────────────────────
// Requery — the ONLY safe way to resolve an uncertain purchase
// ─────────────────────────────────────────────────────────────

export interface RequeryResult {
  status: string;
  token?: string;
  units?: string;
  canRequery?: boolean;
}

/** Asks BigiSub to re-check with the operator and update the status. */
export async function requeryTransaction(tranxId: string): Promise<RequeryResult> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: `/api/v2/anubis/transactions/${encodeURIComponent(tranxId)}/requery/`,
    timeoutMs: 15_000,
  });
  const data = payload.data ?? {};
  return {
    status: String(data.new_status ?? data.old_status ?? ""),
    token: typeof data.token === "string" && data.token ? data.token : undefined,
    units: typeof data.units === "string" && data.units ? data.units : undefined,
  };
}

/** Reads the current status without asking BigiSub to re-check upstream. */
export async function getTransaction(tranxId: string): Promise<RequeryResult> {
  const payload = await call<{ data?: Record<string, unknown> }>({
    path: `/api/v2/anubis/transactions/${encodeURIComponent(tranxId)}/`,
    method: "GET",
    timeoutMs: 10_000,
  });
  const data = payload.data ?? {};
  return {
    status: String(data.status ?? ""),
    canRequery: data.can_requery === true,
  };
}
