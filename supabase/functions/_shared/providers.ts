/**
 * Outbound VTU fulfilment gateways.
 *
 * All operator credentials live here, server-side only. They must never be
 * shipped to the mobile client: an EXPO_PUBLIC_* variable is readable by
 * anyone who unzips the APK.
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
  token?: string;
  units?: string;
  /**
   * The provider's own code, handed back raw so vtu-state decides what it
   * means. Fulfilment used to throw for anything that was not a success,
   * which collapsed "the operator declined" and "the operator is still
   * thinking" into the same outcome — and the caller reversed for both.
   */
  providerCode?: string;
  providerStatus?: string;
}

export class FulfilmentError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

// ─────────────────────────────────────────────────────────────
// VTPass — airtime, data, electricity, cable
// ─────────────────────────────────────────────────────────────

export const VTPASS_SERVICE_MAP: Record<
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

export function resolveVtpassServiceId(serviceType: string, provider: string): string {
  const key = String(provider).toLowerCase();
  const mapping = VTPASS_SERVICE_MAP[key];
  if (!mapping) return key;
  if (serviceType === "airtime" && mapping.airtime) return mapping.airtime;
  if (serviceType === "data" && mapping.data) return mapping.data;
  if (serviceType === "power" && mapping.power) return mapping.power;
  if (serviceType === "cable" && mapping.cable) return mapping.cable;
  return key;
}

function vtpassBaseUrl(): string {
  return Deno.env.get("VTPASS_BASE_URL") || "https://sandbox.vtpass.com/api";
}

function vtpassCredentials(): { apiKey: string; secretKey: string } | null {
  const apiKey = Deno.env.get("VTPASS_API_KEY");
  const secretKey = Deno.env.get("VTPASS_SECRET_KEY");
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey };
}

/**
 * VTPass request_id must start with WAT (UTC+1) YYYYMMDDHHmm.
 *
 * Derived from the MiliPay reference so a retry reuses the same request_id and
 * VTPass deduplicates it for us — but that only holds if the timestamp is
 * stable too. It used to come from Date.now(), so a retry a minute later
 * produced a DIFFERENT request_id and VTPass treated it as a fresh purchase:
 * the customer paid once and could be credited twice, at our cost.
 *
 * `issuedAt` is the transaction's own initiated_at, so every retry of the
 * same transaction produces the same id.
 */
export function vtpassRequestId(reference: string, issuedAt?: string | Date): string {
  const base = issuedAt ? new Date(issuedAt) : new Date();
  const wat = new Date(base.getTime() + 60 * 60 * 1000);
  const stamp = [
    wat.getUTCFullYear(),
    String(wat.getUTCMonth() + 1).padStart(2, "0"),
    String(wat.getUTCDate()).padStart(2, "0"),
    String(wat.getUTCHours()).padStart(2, "0"),
    String(wat.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  const suffix = reference.replace(/[^A-Za-z0-9]/g, "").slice(-12).toLowerCase();
  return `${stamp}${suffix}`;
}

export function normalizeNigerianPhone(phone?: string): string {
  if (!phone) return "";
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.startsWith("+234")) return "0" + clean.slice(4);
  if (clean.startsWith("234") && clean.length > 10) return "0" + clean.slice(3);
  return clean;
}

export async function fetchVtpassVariations(
  serviceId: string,
  surcharge: number,
  timeoutMs = 4000,
): Promise<Variation[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${vtpassBaseUrl()}/service-variations?serviceID=${encodeURIComponent(serviceId)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    if (!res.ok) throw new Error(`VTPass variations HTTP ${res.status}`);

    const body = await res.json();
    const raw = body?.content?.variations ?? [];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("VTPass returned no variations");
    }

    return raw.map((v: Record<string, string>, idx: number) => {
      const baseAmount = Math.round((parseFloat(v.variation_amount) || 0) * 100) / 100;
      const validity = /(\d+\s*(?:day|days|hrs|hours|hr|month|months|week|weeks))/i
        .exec(v.name ?? "")?.[1]?.trim() ?? "30 Days";

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
  } finally {
    clearTimeout(timer);
  }
}

export async function payWithVtpass(args: {
  serviceType: string;
  serviceId: string;
  reference: string;
  billersCode: string;
  phone: string;
  baseAmount: number;
  variationCode?: string;
  meterType?: string;
  /** The transaction's initiated_at, so a retry reuses the same request_id. */
  issuedAt?: string;
  timeoutMs?: number;
}): Promise<Fulfilment> {
  const creds = vtpassCredentials();
  if (!creds) {
    throw new FulfilmentError(
      "Telecom gateway is not configured. No funds were moved.",
      true,
    );
  }

  const payload: Record<string, unknown> = {
    request_id: vtpassRequestId(args.reference, args.issuedAt),
    serviceID: args.serviceId,
    billersCode: args.billersCode,
    amount: args.baseAmount,
    phone: args.phone,
  };

  if (args.serviceType === "power") {
    payload.variation_code = args.meterType || "prepaid";
  } else if (args.variationCode) {
    payload.variation_code = args.variationCode;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);

  let body: Record<string, any>;
  try {
    const res = await fetch(`${vtpassBaseUrl()}/pay`, {
      method: "POST",
      headers: {
        "api-key": creds.apiKey,
        "secret-key": creds.secretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    body = await res.json();
  } catch (err) {
    // Timed out or unreachable: the operator may still have delivered, so this
    // is reported as retryable and the caller reverses.
    throw new FulfilmentError(
      err instanceof Error && err.name === "AbortError"
        ? "Telecom gateway timed out"
        : "Could not reach the telecom gateway",
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  // The code is handed back rather than judged here. '099' and '001' mean
  // "still processing", and treating them as success is how a customer gets
  // charged for airtime VTPass later failed to send. statusForVtpassCode in
  // vtu-state.ts owns that mapping, and it is tested.
  const code = String(body.code ?? "");
  if (code !== "000" && code !== "099" && code !== "001") {
    throw new FulfilmentError(
      body.response_description || `Operator declined the request (code ${code})`,
    );
  }

  let token: string | undefined;
  let units: string | undefined;
  if (typeof body.purchased_code === "string") {
    token = /Token\s*:\s*([0-9-]+)/i.exec(body.purchased_code)?.[1]?.trim();
    units = /Units\s*:\s*([0-9.]+\s*kWh)/i.exec(body.purchased_code)?.[1]?.trim();
  }

  return {
    operatorReference: body.content?.transactions?.transactionId ||
      body.requestId ||
      `VTP-${Date.now()}`,
    token,
    units,
    providerCode: code,
    providerStatus: body.content?.transactions?.status,
  };
}

/**
 * VTPass wallet balance.
 *
 * Checked BEFORE the customer's bank is debited. The two money movements in a
 * purchase are independent — Mono moves the customer's money to us, and our
 * own pre-funded VTPass wallet pays the operator — so an empty VTPass wallet
 * means we take the customer's money and cannot deliver. Refusing a sale is
 * survivable; that is not.
 */
export async function fetchVtpassWalletBalance(timeoutMs = 4000): Promise<number | null> {
  const creds = vtpassCredentials();
  if (!creds) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${vtpassBaseUrl()}/balance`, {
      headers: { "api-key": creds.apiKey, "secret-key": creds.secretKey },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const balance = Number(body?.contents?.balance ?? body?.balance);
    return Number.isFinite(balance) ? balance : null;
  } catch {
    // Unknown, not zero. The caller decides whether to proceed blind; saying
    // "no balance" here would block every sale whenever VTPass is slow.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask VTPass what actually happened to a transaction we never got a final
 * answer for. This is what resolves fulfilment_pending, and it is the reason
 * a timeout no longer triggers a blind reversal.
 */
export async function requeryVtpass(
  reference: string,
  issuedAt: string | undefined,
  timeoutMs = 10_000,
): Promise<{ providerCode: string; providerStatus?: string; token?: string; units?: string }> {
  const creds = vtpassCredentials();
  if (!creds) throw new FulfilmentError("Telecom gateway is not configured", true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${vtpassBaseUrl()}/requery`, {
      method: "POST",
      headers: {
        "api-key": creds.apiKey,
        "secret-key": creds.secretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request_id: vtpassRequestId(reference, issuedAt) }),
      signal: controller.signal,
    });
    const body = await res.json();
    let token: string | undefined;
    let units: string | undefined;
    if (typeof body.purchased_code === "string") {
      token = /Token\s*:\s*([0-9-]+)/i.exec(body.purchased_code)?.[1]?.trim();
      units = /Units\s*:\s*([0-9.]+\s*kWh)/i.exec(body.purchased_code)?.[1]?.trim();
    }
    return {
      providerCode: String(body.code ?? ""),
      providerStatus: body.content?.transactions?.status,
      token,
      units,
    };
  } catch (err) {
    throw new FulfilmentError(
      err instanceof Error && err.name === "AbortError"
        ? "Requery timed out"
        : "Could not reach the telecom gateway",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// BigiSub — wholesale SME data bundles
// ─────────────────────────────────────────────────────────────

/**
 * BigiSub carries SME data for MTN and Airtel ONLY. Everything else — all
 * airtime, retail data, Glo and 9mobile data, power, cable — is VTPass.
 *
 * This used to map Glo to 3 and 9mobile to 4, and the mobile app defaulted
 * every network to the SME tab, so Glo data was routed to a gateway that does
 * not sell it. Returning null makes the caller choose a real route rather than
 * silently falling through to MTN, which is what `default: return 1` did.
 */
export const BIGISUB_NETWORKS: Record<string, number> = {
  mtn: 1,
  airtel: 2,
};

export function bigisubNetworkId(provider: string): number | null {
  return BIGISUB_NETWORKS[String(provider).toLowerCase().trim()] ?? null;
}

export function supportsSmeData(provider: string): boolean {
  return bigisubNetworkId(provider) !== null;
}

function bigisubConfig(): { baseUrl: string; token: string; pin: string } | null {
  const token = Deno.env.get("BIGISUB_API_TOKEN");
  const pin = Deno.env.get("BIGISUB_TRANSACTION_PIN");
  if (!token || !pin) return null;
  return {
    baseUrl: Deno.env.get("BIGISUB_BASE_URL") || "https://api.bigisub.ng",
    token,
    pin,
  };
}

export function isBigisubConfigured(): boolean {
  return bigisubConfig() !== null;
}

export async function fetchSmePlans(
  networkId: number,
  surcharge: number,
  timeoutMs = 4000,
): Promise<Variation[]> {
  const cfg = bigisubConfig();
  if (!cfg) throw new Error("BigiSub is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v2/vtu/data/plans/?network=${networkId}&plantype=SME`,
      {
        headers: { Authorization: `Token ${cfg.token}`, Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`BigiSub plans HTTP ${res.status}`);

    const body = await res.json();
    const list = Array.isArray(body?.data) ? body.data : [];

    return list
      .filter((p: Record<string, any>) => !p.plan_disabled)
      .map((p: Record<string, any>, idx: number) => {
        const baseAmount = parseFloat(p.amount ?? p.plan_amount) || 0;
        return {
          id: `sme_${p.network}_${p.id}_${idx}`,
          variation_code: String(p.id),
          name: `${p.size} (${p.plantype || "SME"})`,
          validity: p.validity || "30 Days",
          baseAmount,
          surcharge,
          price: Math.ceil(baseAmount + surcharge),
          fixedPrice: true,
        };
      });
  } finally {
    clearTimeout(timer);
  }
}

export async function purchaseSmeData(args: {
  networkId: number;
  planId: number;
  phone: string;
  timeoutMs?: number;
}): Promise<Fulfilment> {
  const cfg = bigisubConfig();
  if (!cfg) {
    throw new FulfilmentError("SME data gateway is not configured. No funds were moved.", true);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);

  let body: Record<string, any>;
  let ok: boolean;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v2/vtu/data/purchase/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        network: args.networkId,
        plan: args.planId,
        phone_number: args.phone,
        pin: cfg.pin,
        ported_number: true,
      }),
      signal: controller.signal,
    });
    ok = res.ok;
    body = await res.json();
  } catch (err) {
    throw new FulfilmentError(
      err instanceof Error && err.name === "AbortError"
        ? "SME data gateway timed out"
        : "Could not reach the SME data gateway",
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  const providerStatus = String(body.data?.status ?? (body.success === true ? "successful" : ""));
  const pending = ok && /pending|processing/i.test(providerStatus);
  const delivered = ok && (body.success === true || /successful|success|delivered/i.test(providerStatus));

  if (!delivered && !pending) {
    throw new FulfilmentError(
      body.message || body.detail ||
        (typeof body.data === "string" ? body.data : "SME data purchase was declined"),
    );
  }

  return {
    operatorReference: body.data?.reference || body.data?.transaction_id ||
      `BGS-${Date.now()}`,
    providerStatus,
  };
}
