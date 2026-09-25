/**
 * VTPass — the gateway that delivers the VALUE.
 *
 * Leg 2 of a purchase. Mono moves the customer's money to MiliPay; this spends
 * MiliPay's own pre-funded VTPass wallet to credit the operator. Two separate
 * pots, and the order between them is the whole design: the customer's money
 * is confirmed before ours is spent.
 *
 * All operator credentials live here, server-side only. They must never reach
 * the mobile client — an EXPO_PUBLIC_* variable is readable by anyone who
 * unzips the APK.
 *
 * ─── WHY VTPASS AND NOT BIGISUB, FOR NOW ───
 *
 * request_id. We choose it, VTPass stores it, and requery() can ask about it
 * later — so a purchase whose call timed out before returning anything can
 * still be resolved by machine. BigiSub accepts no client-supplied key on any
 * endpoint, so the same timeout there left nothing to ask about and a human
 * had to go and look. BigiSub is parked, not deleted, and nothing live imports
 * it; tests/gateway-isolation.test.ts holds that line.
 *
 * ─── THE THREE THINGS THAT ARE EASY TO GET WRONG ───
 *
 * 1. Code 000 does NOT mean delivered. It means "TRANSACTION PROCESSED" — the
 *    request was accepted. The real outcome is content.transactions.status,
 *    which is one of initiated / pending / delivered. Nothing in this file
 *    judges either value; both are handed back raw and vtu-state.ts owns the
 *    mapping, where it is tested.
 *
 * 2. GET and POST take DIFFERENT credentials. POST is api-key + secret-key,
 *    GET is api-key + public-key. Sending the wrong pair is a 401 that looks
 *    like a credential problem rather than a header problem.
 *
 * 3. A timed-out purchase is NOT re-paid. Replaying the same request_id
 *    returns code 014 ("request id already used"), not the original result,
 *    so the recovery for an uncertain purchase is requery() — never a second
 *    pay(). This is the one rule that keeps a customer from being charged
 *    once and credited twice at our expense.
 *
 * Every request here was re-checked against VTPass's own documentation on
 * 25 September 2026 — each endpoint, header pair, body and response shape,
 * and every serviceID in SERVICE_MAP against that biller's own page:
 *   https://www.vtpass.com/documentation/authentication/
 *   https://www.vtpass.com/documentation/how-to-generate-request-id/
 *   https://vtpass.com/documentation/response-codes/
 *   https://www.vtpass.com/documentation/re-query-services/
 *   https://vtpass.com/documentation/get-vtpass-wallet-balance/
 *   https://vtpass.com/documentation/mtn-airtime-vtu-api/ (and airtel, glo, 9mobile)
 *   https://vtpass.com/documentation/mtn-data/
 *   https://vtpass.com/documentation/ikedc-ikeja-electricity-distribution-company-payment-api/
 *     (and eko, aedc, ibadan, phed, eedc, kano)
 *   https://www.vtpass.com/documentation/dstv-subscription/ (and gotv, startimes)
 */

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

export interface Fulfilment {
  operatorReference: string;
  /** Prepaid electricity only. */
  token?: string;
  units?: string;
  /**
   * The provider's own code and status, handed back raw so vtu-state decides
   * what they mean together. Fulfilment used to throw for anything that was
   * not a success, which collapsed "the operator declined" and "the operator
   * is still thinking" into one outcome — and the caller reversed for both.
   */
  providerCode: string;
  providerStatus?: string;
}

export interface Verification {
  customerName: string;
  customerAddress: string | null;
  /** VTPass returns the biller's own floor for some services. */
  minAmount: number | null;
  /** Cable only: what the card is currently subscribed to. */
  currentBouquet: string | null;
  raw: Record<string, unknown>;
}

export class FulfilmentError extends Error {
  constructor(
    message: string,
    /**
     * The call did not complete, so we do not know whether VTPass acted. The
     * resolution is ALWAYS requery, never a second pay() — see rule 3 above.
     */
    readonly indeterminate = false,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "FulfilmentError";
  }
}

// ─────────────────────────────────────────────────────────────
// Service identifiers
//
// The sandbox's test numbers are deliberately NOT here. Nothing on the server
// uses them, and the copy the app shows lives in
// mobile-app/src/lib/environment.ts, shaped so a production bundle cannot
// contain it.
// ─────────────────────────────────────────────────────────────

/** MiliPay's provider ids mapped onto VTPass serviceIDs. */
export const SERVICE_MAP: Record<
  string,
  { airtime?: string; data?: string; power?: string; cable?: string }
> = {
  mtn: { airtime: "mtn", data: "mtn-data" },
  airtel: { airtime: "airtel", data: "airtel-data" },
  glo: { airtime: "glo", data: "glo-data" },
  "9mobile": { airtime: "etisalat", data: "etisalat-data" },
  ikedc: { power: "ikeja-electric" },
  ekedc: { power: "eko-electric" },
  aedc: { power: "abuja-electric" },
  ibedc: { power: "ibadan-electric" },
  phed: { power: "portharcourt-electric" },
  eedc: { power: "enugu-electric" },
  kedco: { power: "kano-electric" },
  dstv: { cable: "dstv" },
  gotv: { cable: "gotv" },
  startimes: { cable: "startimes" },
};

/**
 * Returns null rather than guessing. A provider we have no mapping for must
 * make the caller choose, not fall through to whatever key was passed — that
 * is how a Glo request reaches a gateway that does not sell Glo.
 */
export function resolveServiceId(serviceType: string, provider: string): string | null {
  const mapping = SERVICE_MAP[String(provider).toLowerCase().trim()];
  if (!mapping) return null;
  switch (serviceType) {
    case "airtime":
      return mapping.airtime ?? null;
    case "data":
      return mapping.data ?? null;
    case "power":
      return mapping.power ?? null;
    case "cable":
      return mapping.cable ?? null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

function baseUrl(): string {
  // No default. An unset URL must not silently pick an environment — which one
  // it picked is exactly the question environment.ts exists to answer.
  return (Deno.env.get("VTPASS_BASE_URL") ?? "").replace(/\/+$/, "");
}

function credentials(): { apiKey: string; secretKey: string; publicKey: string } | null {
  const apiKey = Deno.env.get("VTPASS_API_KEY");
  const secretKey = Deno.env.get("VTPASS_SECRET_KEY");
  const publicKey = Deno.env.get("VTPASS_PUBLIC_KEY");
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey, publicKey: publicKey ?? "" };
}

export function isConfigured(): boolean {
  return credentials() !== null && baseUrl().length > 0;
}

/** POST: api-key + secret-key. */
function postHeaders(creds: NonNullable<ReturnType<typeof credentials>>): HeadersInit {
  return {
    "api-key": creds.apiKey,
    "secret-key": creds.secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * GET: api-key + public-key.
 *
 * The public key is only used here. If it is unset we fall back to the secret
 * key rather than sending an unauthenticated read — a catalogue that silently
 * returns nothing is worse than one that fails loudly.
 */
function getHeaders(creds: NonNullable<ReturnType<typeof credentials>>): HeadersInit {
  return creds.publicKey
    ? { "api-key": creds.apiKey, "public-key": creds.publicKey, Accept: "application/json" }
    : { "api-key": creds.apiKey, "secret-key": creds.secretKey, Accept: "application/json" };
}

// ─────────────────────────────────────────────────────────────
// request_id — the idempotency key
// ─────────────────────────────────────────────────────────────

/**
 * VTPass requires the first 12 characters to be YYYYMMDDHHII in Africa/Lagos
 * (GMT+1, no DST), and they must be TODAY'S date. The rest is ours.
 *
 * Derived from the MiliPay reference and the transaction's own initiated_at,
 * so every call about the same transaction produces the same id and VTPass
 * deduplicates for us. It used to come from Date.now(), so a retry a minute
 * later produced a DIFFERENT id and VTPass treated it as a fresh purchase —
 * the customer paid once and could be credited twice, at our cost.
 *
 * The "today" rule has a consequence worth stating plainly: a purchase cannot
 * be re-submitted the next day, because its id would carry yesterday's date.
 * That is not a limitation in practice — a day-old uncertain purchase is
 * resolved by requery(), which looks up the original id and does not mind how
 * old it is.
 *
 * `issuedAt` is REQUIRED, deliberately. It was optional, defaulting to "now",
 * and that default is a silent catastrophe: transactions.initiated_at is
 * nullable, so one null row would have produced a fresh request_id on every
 * call — no deduplication at the gateway, and a requery asking about an id
 * VTPass had never seen. A caller with no timestamp must be made to say so,
 * not quietly given a useless id.
 */
export function requestId(reference: string, issuedAt: string | Date): string {
  const base = new Date(issuedAt);
  if (Number.isNaN(base.getTime())) {
    throw new FulfilmentError(
      "Cannot build a stable gateway reference without the transaction's timestamp.",
    );
  }
  // Lagos is UTC+1 year-round, so a fixed offset is correct here.
  const lagos = new Date(base.getTime() + 60 * 60 * 1000);
  const stamp = [
    lagos.getUTCFullYear(),
    String(lagos.getUTCMonth() + 1).padStart(2, "0"),
    String(lagos.getUTCDate()).padStart(2, "0"),
    String(lagos.getUTCHours()).padStart(2, "0"),
    String(lagos.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  const suffix = reference.replace(/[^A-Za-z0-9]/g, "").slice(-12).toLowerCase();
  return `${stamp}${suffix}`;
}

export function normalizeNigerianPhone(phone?: string): string {
  if (!phone) return "";
  const clean = String(phone).replace(/[^0-9+]/g, "");
  if (clean.startsWith("+234")) return "0" + clean.slice(4);
  if (clean.startsWith("234") && clean.length > 10) return "0" + clean.slice(3);
  return clean;
}

// ─────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────

async function call(
  path: string,
  init: {
    method: "GET" | "POST";
    body?: unknown;
    timeoutMs: number;
    /**
     * True only for /pay. A failed call to it may still have moved value, so
     * the failure is indeterminate and must be resolved by requery. Verify and
     * requery change nothing, so their failures are just failures — marking
     * them indeterminate would put a transaction into fulfilment_pending for a
     * lookup that never touched anyone's money.
     */
    mutating?: boolean;
  },
): Promise<Record<string, any>> {
  const creds = credentials();
  if (!creds || !baseUrl()) {
    throw new FulfilmentError("Telecom gateway is not configured. No funds were moved.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: init.method === "POST" ? postHeaders(creds) : getHeaders(creds),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: Record<string, any>;
    try {
      body = JSON.parse(text);
    } catch {
      // VTPass answers some failures with an HTML error page. That is not a
      // decline, it is an unusable answer, so it is indeterminate.
      throw new FulfilmentError(
        `Telecom gateway returned a non-JSON response (HTTP ${res.status})`,
        init.mutating === true,
      );
    }
    return body;
  } catch (err) {
    if (err instanceof FulfilmentError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new FulfilmentError(
      aborted ? "Telecom gateway timed out" : "Could not reach the telecom gateway",
      init.mutating === true,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────

export async function listVariations(
  serviceId: string,
  surcharge: number,
  timeoutMs = 6_000,
): Promise<Variation[]> {
  const body = await call(
    `/service-variations?serviceID=${encodeURIComponent(serviceId)}`,
    { method: "GET", timeoutMs },
  );

  const raw = body?.content?.variations ?? body?.content?.varations ?? [];
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw.map((v: Record<string, string>, idx: number) => {
    const baseAmount = Math.round((parseFloat(v.variation_amount) || 0) * 100) / 100;
    // Optional plurals rather than an alternation of both forms: "day|days"
    // matched "day" first, so "2 days" was shown as "2 day".
    const validity =
      /(\d+\s*(?:days?|hours?|hrs?|weeks?|months?))/i.exec(v.name ?? "")?.[1]?.trim() ?? "";
    return {
      id: `${v.variation_code}_${baseAmount}_${idx}`,
      variation_code: v.variation_code,
      name: v.name,
      validity,
      baseAmount,
      surcharge,
      price: Math.ceil(baseAmount + surcharge),
      fixedPrice: v.fixedPrice === "Yes",
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Verification — required before electricity and cable
// ─────────────────────────────────────────────────────────────

/**
 * The biller's minimum. VTPass's own IKEDC example returns
 * `Min_Purchase_Amount: ""` beside a separate `Minimum_Amount`, so an empty
 * first field must fall through to the next rather than end the search — the
 * `??` this replaced stopped at "" and reported no minimum at all.
 */
function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Confirm whose meter or smartcard this is, before anyone pays for it.
 *
 * Two reasons it is not optional: the customer gets to catch their own typo
 * while it is still free, and VTPass returns the biller's own minimum, which
 * we would otherwise be guessing at.
 */
export async function verifyMerchant(args: {
  serviceId: string;
  billersCode: string;
  /** Electricity only: prepaid | postpaid. */
  type?: string;
  timeoutMs?: number;
}): Promise<Verification> {
  const body = await call("/merchant-verify", {
    method: "POST",
    body: {
      billersCode: args.billersCode,
      serviceID: args.serviceId,
      ...(args.type ? { type: args.type } : {}),
    },
    timeoutMs: args.timeoutMs ?? 12_000,
  });

  const content = (body?.content ?? {}) as Record<string, unknown>;

  // A failed verification comes back inside content.error rather than as a
  // non-2xx, so an unchecked caller would read it as a success with no name.
  const error = content.error ?? body?.content?.errors;
  if (error) {
    throw new FulfilmentError(
      typeof error === "string" ? error : "That account could not be verified.",
      false,
      String(body?.code ?? ""),
    );
  }

  // VTPass's documented signal for a bad meter or card number. Checked on its
  // own because it is not guaranteed to come with an error message, and a
  // response carrying it must never be read as verified.
  if (content.WrongBillersCode === true) {
    throw new FulfilmentError(
      "That number was not recognised by the biller. Please check it and try again.",
      false,
      String(body?.code ?? ""),
    );
  }

  const name = content.Customer_Name ?? content.customer_name ?? content.CustomerName;
  if (!name || String(name).trim().length === 0) {
    throw new FulfilmentError("That account could not be verified.", false, String(body?.code ?? ""));
  }

  // Electricity only. The disco saying it cannot vend to this meter means the
  // purchase would fail after the customer had paid, so say so now, while
  // nothing has been taken. Only an explicit "no" blocks; absent means unknown.
  if (String(content.Can_Vend ?? "").trim().toLowerCase() === "no") {
    throw new FulfilmentError(
      "This meter cannot be credited right now. Please contact your electricity company.",
      false,
      String(body?.code ?? ""),
    );
  }

  return {
    customerName: String(name).trim(),
    customerAddress:
      typeof content.Address === "string" && content.Address.trim() ? content.Address.trim() : null,
    minAmount: firstPositive(content.Min_Purchase_Amount, content.Minimum_Amount, content.minimum_amount),
    currentBouquet:
      typeof content.Current_Bouquet === "string" ? content.Current_Bouquet : null,
    raw: content,
  };
}

// ─────────────────────────────────────────────────────────────
// Purchase
// ─────────────────────────────────────────────────────────────

/**
 * The prepaid electricity token and units, from wherever this disco put them.
 *
 * The discos do not agree. IKEDC's documented response has
 * `purchased_code: "Token : 2636…"` and a separate top-level
 * `units: "79.9 kWh"`; EKEDC's has the same purchased_code plus `mainToken`
 * and a numeric (sometimes null) `mainTokenUnits`. This used to look for units
 * only inside purchased_code, which neither documented response puts there —
 * so every token would have been shown without its units.
 *
 * Exported for tests only.
 */
export function extractToken(body: Record<string, any>): { token?: string; units?: string } {
  const source = typeof body?.purchased_code === "string" ? body.purchased_code : "";
  const fromContent = body?.content?.transactions?.purchased_code;
  const text = source || (typeof fromContent === "string" ? fromContent : "");

  const token =
    /Token\s*:\s*([0-9-]+)/i.exec(text)?.[1]?.trim() ||
    (typeof body?.mainToken === "string" && body.mainToken.trim() ? body.mainToken.trim() : undefined);

  const mainUnits = Number(body?.mainTokenUnits);
  const units =
    /Units\s*:\s*([0-9.]+\s*kWh)/i.exec(text)?.[1]?.trim() ||
    (typeof body?.units === "string" && body.units.trim() ? body.units.trim() : undefined) ||
    (body?.mainTokenUnits != null && Number.isFinite(mainUnits) && mainUnits > 0
      ? `${mainUnits} kWh`
      : undefined);

  return {
    ...(token ? { token } : {}),
    ...(units ? { units } : {}),
  };
}

/**
 * VTPass serviceIDs whose purchase REQUIRES subscription_type.
 *
 * DStv and GOtv reject a purchase without it; StarTimes does not take it at
 * all. "change" is the value for buying a chosen bouquet — which is the only
 * thing the app offers, since the customer always picks from the catalogue.
 * "renew" (repeat the current bouquet at its renewal price) is not offered.
 *
 * https://www.vtpass.com/documentation/dstv-subscription/
 * https://www.vtpass.com/documentation/gotv-subscription/
 */
const NEEDS_SUBSCRIPTION_TYPE = new Set(["dstv", "gotv"]);

/** Exported for tests only: the exact body pay() sends. */
export function payPayload(args: {
  serviceType: string;
  serviceId: string;
  reference: string;
  billersCode: string;
  phone: string;
  baseAmount: number;
  variationCode?: string;
  meterType?: string;
  issuedAt: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    request_id: requestId(args.reference, args.issuedAt),
    serviceID: args.serviceId,
    // Airtime's documented body is request_id, serviceID, amount and phone —
    // no billersCode. Every other service requires it: the recipient's number
    // for data, the meter for power, the smartcard for cable.
    ...(args.serviceType === "airtime" ? {} : { billersCode: args.billersCode }),
    amount: args.baseAmount,
    phone: args.phone,
  };

  if (args.serviceType === "power") {
    payload.variation_code = args.meterType || "prepaid";
  } else if (args.variationCode) {
    payload.variation_code = args.variationCode;
  }

  if (args.serviceType === "cable" && NEEDS_SUBSCRIPTION_TYPE.has(args.serviceId)) {
    payload.subscription_type = "change";
  }

  return payload;
}

/**
 * Spend MiliPay's wallet to credit the customer's beneficiary.
 *
 * Only ever called once the customer's money is confirmed. Never called twice
 * for the same transaction — see rule 3 at the top of this file.
 */
export async function pay(args: {
  serviceType: string;
  serviceId: string;
  reference: string;
  /** Phone number, meter number or smartcard number. */
  billersCode: string;
  phone: string;
  baseAmount: number;
  variationCode?: string;
  meterType?: string;
  /** The transaction's initiated_at. Required: see requestId above. */
  issuedAt: string;
  timeoutMs?: number;
}): Promise<Fulfilment> {
  const payload = payPayload(args);

  const body = await call("/pay", {
    method: "POST",
    body: payload,
    timeoutMs: args.timeoutMs ?? 20_000,
    mutating: true,
  });

  const code = String(body.code ?? "");
  const transactions = body?.content?.transactions ?? {};

  // 014 means this request_id has already been submitted. That is not a
  // failure and must never be treated as one: the first submission may well
  // have delivered. It is indeterminate, and requery() resolves it.
  if (code === "014") {
    throw new FulfilmentError(
      "This purchase was already submitted to the gateway.",
      true,
      code,
    );
  }

  return {
    operatorReference:
      transactions.transactionId || body.requestId || payload.request_id as string,
    providerCode: code,
    providerStatus: typeof transactions.status === "string" ? transactions.status : undefined,
    ...extractToken(body),
  };
}

// ─────────────────────────────────────────────────────────────
// Requery — what actually happened
// ─────────────────────────────────────────────────────────────

export interface RequeryResult {
  providerCode: string;
  providerStatus?: string;
  token?: string;
  units?: string;
  operatorReference?: string;
}

/**
 * Ask VTPass what became of a transaction we never got a final answer for.
 *
 * This is what resolves fulfilment_pending, and the reason a timeout no longer
 * triggers a blind reversal. Safe to call as often as needed.
 */
export async function requery(
  reference: string,
  issuedAt: string,
  timeoutMs = 12_000,
): Promise<RequeryResult> {
  const body = await call("/requery", {
    method: "POST",
    body: { request_id: requestId(reference, issuedAt) },
    timeoutMs,
  });

  const transactions = body?.content?.transactions ?? {};
  return {
    providerCode: String(body.code ?? ""),
    providerStatus: typeof transactions.status === "string" ? transactions.status : undefined,
    operatorReference: transactions.transactionId || undefined,
    ...extractToken(body),
  };
}

// ─────────────────────────────────────────────────────────────
// Wallet — OUR money
// ─────────────────────────────────────────────────────────────

/**
 * Read before the customer's bank is ever touched.
 *
 * The two money movements in a purchase are independent, so an empty VTPass
 * wallet means taking the customer's money and being unable to deliver.
 * Refusing a sale is survivable; that is not.
 *
 * Returns null for "unknown", never 0. Saying "no balance" when VTPass is
 * merely slow would block every sale.
 */
export async function walletBalance(timeoutMs = 5_000): Promise<number | null> {
  try {
    const body = await call("/balance", { method: "GET", timeoutMs });
    const balance = Number(body?.contents?.balance ?? body?.content?.balance ?? body?.balance);
    return Number.isFinite(balance) ? balance : null;
  } catch {
    return null;
  }
}
