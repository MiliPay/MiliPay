import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  ApiError,
  adminClient,
  handler,
  json,
  loadCustomerProfile,
  requireCaller,
  requireStaffRole,
  type Caller,
} from "../_shared/auth.ts";
import { enforceTransactionLimits } from "../_shared/limits.ts";
import { disabledMessage, readFulfilmentEnvironment } from "../_shared/environment.ts";
import { initiateDebit, isMonoConfigured, monoPaymentMode, toApiError } from "../_shared/mono.ts";
import { roundNaira } from "../_shared/money.ts";
import {
  CUSTOMER_STATUS_COPY,
  statusForBigisubResponse,
  statusForFulfilmentTimeout,
  statusForVtpassCode,
  statusForVtpassTransactionStatus,
  type TransactionStatus,
} from "../_shared/vtu-state.ts";
import { enqueueRefund, transitionTransaction } from "../_shared/transactions.ts";
import {
  bigisubNetworkId,
  fetchSmePlans,
  fetchVtpassVariations,
  fetchVtpassWalletBalance,
  FulfilmentError,
  isBigisubConfigured,
  normalizeNigerianPhone,
  payWithVtpass,
  purchaseSmeData,
  requeryVtpass,
  resolveVtpassServiceId,
  supportsSmeData,
  type Fulfilment,
  type Variation,
} from "../_shared/providers.ts";

/**
 * Quick services: airtime, data (retail + SME), electricity and cable.
 *
 * The shape of a purchase, and why it is in this order:
 *
 *   1. price it here — the client never says what it pays
 *   2. check OUR VTPass wallet, before the customer's bank is touched
 *   3. write the transaction as `initiated` — before any money moves
 *   4. ask Mono to debit the customer's chosen bank account
 *   5. ... webhook confirms ... -> `paid`
 *   6. only now spend our own balance at VTPass or BigiSub
 *
 * Steps 4 and 5 are why the purchase is no longer one blocking request. The
 * customer's part finishes at the fingerprint; the app then follows the
 * transaction live.
 *
 * Routing is fixed: BigiSub carries SME data for MTN and Airtel only.
 * Everything else is VTPass.
 */

// ─────────────────────────────────────────────────────────────
// Margin settings
// ─────────────────────────────────────────────────────────────

interface VtuSettings {
  data_surcharge_ngn: number;
  cable_surcharge_ngn: number;
  power_convenience_fee_ngn: number;
  airtime_surcharge_percent: number;
}

const DEFAULT_SETTINGS: VtuSettings = {
  data_surcharge_ngn: 25,
  cable_surcharge_ngn: 30,
  power_convenience_fee_ngn: 0,
  airtime_surcharge_percent: 0,
};

async function loadSettings(admin: SupabaseClient): Promise<VtuSettings> {
  const { data, error } = await admin
    .from("vtu_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SETTINGS };

  return {
    data_surcharge_ngn: Number(data.data_surcharge_ngn) || 0,
    cable_surcharge_ngn: Number(data.cable_surcharge_ngn) || 0,
    power_convenience_fee_ngn: Number(data.power_convenience_fee_ngn) || 0,
    airtime_surcharge_percent: Number(data.airtime_surcharge_percent) || 0,
  };
}

function surchargeFor(serviceType: string, serviceId: string, settings: VtuSettings): number {
  if (serviceType === "data" || serviceId.includes("data")) return settings.data_surcharge_ngn;
  if (serviceType === "cable") return settings.cable_surcharge_ngn;
  if (serviceType === "power") return settings.power_convenience_fee_ngn;
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  data_surcharge_ngn: z.number().min(0).max(10_000).optional(),
  cable_surcharge_ngn: z.number().min(0).max(10_000).optional(),
  power_convenience_fee_ngn: z.number().min(0).max(10_000).optional(),
  airtime_surcharge_percent: z.number().min(0).max(100).optional(),
});

const purchaseSchema = z.object({
  serviceType: z.enum(["airtime", "data", "power", "cable"]),
  provider: z.string().min(2).max(32),
  destination: z.string().min(3).max(32),
  customerPhone: z.string().max(20).optional(),
  variationCode: z.string().max(64).optional(),
  dataCategory: z.enum(["sme", "direct"]).optional(),
  meterType: z.enum(["prepaid", "postpaid"]).default("prepaid"),
  accountId: z.string().uuid(),
  // Airtime and postpaid power are open-value; bundles are priced from the catalogue.
  amount: z.number().positive().max(1_000_000).optional(),
  pin: z.string().regex(/^[0-9]{4}$/).optional(),
});

type PurchaseInput = z.infer<typeof purchaseSchema>;

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(
      `${first.path.join(".") || "request"}: ${first.message}`,
      400,
      "VALIDATION_FAILED",
    );
  }
  return result.data;
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  // Fail open on infrastructure errors, closed on an actual breach.
  if (error) {
    console.error("[vtu] rate limit check failed", error);
    return;
  }
  if (data === false) {
    throw new ApiError("Too many requests. Please wait a moment and try again.", 429, "RATE_LIMITED");
  }
}

// ─────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────

type Route = "vtpass" | "bigisub";

/**
 * BigiSub sells SME data for MTN and Airtel. Nothing else.
 *
 * Asking for SME data on Glo used to be routed to BigiSub anyway — and the
 * mobile app defaulted every network to the SME tab — so it went to a gateway
 * that does not sell it.
 */
function routeFor(input: PurchaseInput): Route {
  if (input.serviceType === "data" && input.dataCategory === "sme") {
    if (!supportsSmeData(input.provider)) {
      throw new ApiError(
        `SME data is only available on MTN and Airtel. Choose the direct bundle for ${input.provider.toUpperCase()}.`,
        400,
        "SME_NOT_AVAILABLE",
      );
    }
    return "bigisub";
  }
  return "vtpass";
}

// ─────────────────────────────────────────────────────────────
// Server-side pricing: the client never decides what it pays
// ─────────────────────────────────────────────────────────────

interface Priced {
  /** what the customer is charged, in Naira */
  amount: number;
  /** what we send the operator, in Naira */
  baseAmount: number;
  serviceId: string;
  planLabel: string;
}

async function priceTransaction(input: PurchaseInput, settings: VtuSettings): Promise<Priced> {
  const serviceId = resolveVtpassServiceId(input.serviceType, input.provider);
  const surcharge = surchargeFor(input.serviceType, serviceId, settings);

  // Open-value services: the customer names the amount.
  if (input.serviceType === "airtime" || input.serviceType === "power") {
    if (!input.amount) {
      throw new ApiError("Amount is required for this service", 400, "AMOUNT_REQUIRED");
    }
    const base = roundNaira(input.amount);
    const fee = input.serviceType === "airtime"
      ? roundNaira(base * (settings.airtime_surcharge_percent / 100))
      : settings.power_convenience_fee_ngn;

    return {
      amount: roundNaira(base + fee),
      baseAmount: base,
      serviceId,
      planLabel: input.serviceType === "airtime" ? "Airtime" : `Electricity (${input.meterType})`,
    };
  }

  // Fixed-price bundles: resolve the operator's own price for the requested
  // variation, live. The cache is for browsing; it never prices a purchase.
  if (!input.variationCode) {
    throw new ApiError("A bundle must be selected", 400, "VARIATION_REQUIRED");
  }

  let catalogue: Variation[];
  if (routeFor(input) === "bigisub") {
    catalogue = await fetchSmePlans(bigisubNetworkId(input.provider)!, surcharge);
  } else {
    catalogue = await fetchVtpassVariations(serviceId, surcharge);
  }

  const chosen = catalogue.find((v) => v.variation_code === input.variationCode);
  if (!chosen) {
    throw new ApiError(
      "That bundle is no longer available. Refresh and choose again.",
      409,
      "VARIATION_UNAVAILABLE",
    );
  }

  return {
    amount: chosen.price,
    baseAmount: chosen.baseAmount,
    serviceId,
    planLabel: chosen.name,
  };
}

function merchantTitle(input: PurchaseInput, planLabel: string): string {
  const provider = input.provider.toUpperCase();
  switch (input.serviceType) {
    case "data":
      return `${provider} ${input.dataCategory === "sme" ? "SME " : ""}Data`;
    case "power":
      return `${provider} Electricity (${input.meterType.toUpperCase()})`;
    case "cable":
      return `${provider} ${planLabel}`;
    default:
      return `${provider} Airtime`;
  }
}

// ─────────────────────────────────────────────────────────────
// Catalogue, with a cache that is for browsing only
// ─────────────────────────────────────────────────────────────

async function cacheCatalogue(
  admin: SupabaseClient,
  id: string,
  provider: string,
  serviceId: string,
  payload: unknown,
): Promise<void> {
  try {
    await admin.from("provider_catalogue_cache").upsert({
      id,
      provider,
      service_id: serviceId,
      payload,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[vtu] catalogue cache write failed", err);
  }
}

async function cachedCatalogue(admin: SupabaseClient, id: string): Promise<
  { variations: Variation[]; fetchedAt: string } | null
> {
  const { data } = await admin
    .from("provider_catalogue_cache")
    .select("payload, fetched_at")
    .eq("id", id)
    .maybeSingle();
  if (!data?.payload) return null;
  return { variations: data.payload as Variation[], fetchedAt: data.fetched_at };
}

// ─────────────────────────────────────────────────────────────
// Fulfilment (internal — called by the Mono webhook once paid)
// ─────────────────────────────────────────────────────────────

interface TransactionRow {
  id: string;
  reference: string;
  status: TransactionStatus;
  amount: number;
  base_amount: number | null;
  service_type: string | null;
  provider: string | null;
  beneficiary: string | null;
  variation_code: string | null;
  fulfilment_provider: string | null;
  customer_phone?: string | null;
  initiated_at: string | null;
  mono_payment_id: string | null;
}

/**
 * Turns a provider outcome into a state, then records it. Never throws into
 * the caller: the webhook must not retry a payment we have accepted.
 */
async function settleFulfilment(
  admin: SupabaseClient,
  tx: TransactionRow,
  outcome: { status: TransactionStatus; fulfilment?: Fulfilment; reason?: string },
): Promise<TransactionStatus> {
  const patch: Record<string, unknown> = {};
  if (outcome.fulfilment) {
    patch.operator_reference = outcome.fulfilment.operatorReference;
    if (outcome.fulfilment.token) patch.token = outcome.fulfilment.token;
    if (outcome.fulfilment.units) patch.units = outcome.fulfilment.units;
  }

  await transitionTransaction(admin, {
    reference: tx.reference,
    from: "fulfilling",
    to: outcome.status,
    reason: outcome.reason,
    actor: "vtu-service",
    patch,
  });

  // We took the money and could not deliver. The only honest exit is giving
  // it back, and it goes on a queue with retries rather than a log line.
  if (outcome.status === "fulfilment_failed") {
    const queued = await enqueueRefund(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      amount: Number(tx.amount),
      reason: outcome.reason ?? "fulfilment failed",
    });
    if (queued) {
      await transitionTransaction(admin, {
        reference: tx.reference,
        from: "fulfilment_failed",
        to: "refund_pending",
        actor: "vtu-service",
      });
      return "refund_pending";
    }
  }

  return outcome.status;
}

async function fulfilTransaction(admin: SupabaseClient, reference: string): Promise<TransactionStatus> {
  const { data: tx } = await admin
    .from("transactions")
    .select(
      "id, reference, status, amount, base_amount, service_type, provider, beneficiary, variation_code, fulfilment_provider, initiated_at, mono_payment_id",
    )
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");

  const row = tx as TransactionRow;

  if (row.status !== "paid") {
    // Fulfilment is only ever reachable from paid. Anything else is either
    // already in flight or already finished.
    return row.status;
  }

  const moved = await transitionTransaction(admin, {
    reference,
    from: "paid",
    to: "fulfilling",
    actor: "vtu-service",
  });
  if (!moved.ok) return row.status; // another worker got there first

  const isTelecom = row.service_type === "airtime" || row.service_type === "data";
  const destination = isTelecom
    ? normalizeNigerianPhone(row.beneficiary ?? "")
    : (row.beneficiary ?? "");

  try {
    if (row.fulfilment_provider === "bigisub") {
      const fulfilment = await purchaseSmeData({
        networkId: bigisubNetworkId(row.provider ?? "")!,
        planId: Number(row.variation_code),
        phone: destination,
      });
      return await settleFulfilment(admin, row, {
        status: statusForBigisubResponse({ ok: true, status: fulfilment.providerStatus }),
        fulfilment,
      });
    }

    const fulfilment = await payWithVtpass({
      serviceType: row.service_type ?? "airtime",
      serviceId: resolveVtpassServiceId(row.service_type ?? "airtime", row.provider ?? ""),
      reference,
      billersCode: destination,
      phone: destination,
      baseAmount: Number(row.base_amount ?? row.amount),
      variationCode: row.variation_code ?? undefined,
      meterType: row.variation_code ?? "prepaid",
      issuedAt: row.initiated_at ?? undefined,
    });

    return await settleFulfilment(admin, row, {
      status: statusForVtpassCode(fulfilment.providerCode),
      fulfilment,
    });
  } catch (err) {
    // A timeout is NOT a failure. VTPass may well have delivered and we simply
    // did not hear; reversing here refunds the customer AND credits them.
    const retryable = err instanceof FulfilmentError && err.retryable;
    return await settleFulfilment(admin, row, {
      status: retryable ? statusForFulfilmentTimeout() : "fulfilment_failed",
      reason: err instanceof Error ? err.message : "fulfilment error",
    });
  }
}

/** Resolves a transaction the operator never gave a final answer for. */
async function requeryTransaction(admin: SupabaseClient, reference: string): Promise<TransactionStatus> {
  const { data: tx } = await admin
    .from("transactions")
    .select("id, reference, status, amount, initiated_at, fulfilment_provider")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");
  const row = tx as TransactionRow;
  if (row.status !== "fulfilment_pending") return row.status;

  // BigiSub has no documented requery; those are left for the operator view
  // rather than guessed at.
  if (row.fulfilment_provider === "bigisub") return row.status;

  let result: Awaited<ReturnType<typeof requeryVtpass>>;
  try {
    result = await requeryVtpass(reference, row.initiated_at ?? undefined);
  } catch {
    return row.status; // still unknown; try again next sweep
  }

  const status = result.providerStatus
    ? statusForVtpassTransactionStatus(result.providerStatus)
    : statusForVtpassCode(result.providerCode);

  if (status === "fulfilment_pending") return status;

  const patch: Record<string, unknown> = {};
  if (result.token) patch.token = result.token;
  if (result.units) patch.units = result.units;

  await transitionTransaction(admin, {
    reference,
    from: "fulfilment_pending",
    to: status,
    actor: "requery",
    patch,
    metadata: { providerCode: result.providerCode, providerStatus: result.providerStatus },
  });

  if (status === "fulfilment_failed") {
    const queued = await enqueueRefund(admin, {
      transactionId: row.id,
      reference,
      amount: Number(row.amount),
      reason: "operator reported failure on requery",
    });
    if (queued) {
      await transitionTransaction(admin, {
        reference,
        from: "fulfilment_failed",
        to: "refund_pending",
        actor: "requery",
      });
      return "refund_pending";
    }
  }

  return status;
}

/**
 * Internal actions carry the service-role key. requireCaller accepts it, but
 * it resolves to no customer profile, so they are gated explicitly rather
 * than relying on that side effect.
 */
function assertInternal(req: Request): void {
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!serviceKey || provided !== serviceKey) {
    throw new ApiError("Not found", 404, "NOT_FOUND");
  }
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

serve(handler(async (req) => {
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "purchase";

  // ---- Internal: fulfilment and requery --------------------------------
  if (action === "fulfil" || action === "requery") {
    assertInternal(req);
    const reference = String(body?.reference ?? "");
    if (!reference) throw new ApiError("reference is required", 400, "VALIDATION_FAILED");

    const status = action === "fulfil"
      ? await fulfilTransaction(admin, reference)
      : await requeryTransaction(admin, reference);

    return json({ success: true, reference, status });
  }

  const caller: Caller = await requireCaller(req);

  // ---- Read the live margin configuration ------------------------------
  if (action === "get_settings") {
    return json({ success: true, settings: await loadSettings(admin) });
  }

  // ---- Update margins (administrators only) ----------------------------
  if (action === "update_settings") {
    await requireStaffRole(admin, caller.id, ["admin", "super_admin"]);
    const patch = parse(settingsSchema, body);

    const { data, error } = await admin
      .from("vtu_settings")
      .upsert({
        id: "default",
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: caller.email ?? caller.id,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("[vtu] settings upsert failed", error);
      throw new ApiError("Could not save margin settings", 500, "SETTINGS_WRITE_FAILED");
    }

    return json({ success: true, settings: await loadSettings(admin), saved: Boolean(data) });
  }

  // ---- Retail catalogue ------------------------------------------------
  if (action === "get_variations") {
    const { serviceType = "data", provider = "mtn" } = body;
    const settings = await loadSettings(admin);
    const serviceId = body.serviceId || resolveVtpassServiceId(serviceType, provider);
    const surcharge = surchargeFor(serviceType, serviceId, settings);
    const cacheId = `vtpass:${serviceId}`;

    try {
      const variations = await fetchVtpassVariations(serviceId, surcharge);
      await cacheCatalogue(admin, cacheId, "vtpass", serviceId, variations);
      return json({ success: true, serviceId, surcharge, variations, stale: false });
    } catch (err) {
      // A slow provider used to be a hard 503, so a customer could not even
      // browse. The cache is for browsing ONLY: the price actually charged is
      // re-resolved live at purchase, and a bundle whose price has moved is
      // refused there rather than honoured from here.
      console.warn(`[vtu] variations unavailable for ${serviceId}`, err);
      const cached = await cachedCatalogue(admin, cacheId);
      if (cached) {
        return json({
          success: true,
          serviceId,
          surcharge,
          variations: cached.variations,
          stale: true,
          fetchedAt: cached.fetchedAt,
        });
      }
      throw new ApiError(
        "Live bundle prices are temporarily unavailable. Please try again shortly.",
        503,
        "CATALOGUE_UNAVAILABLE",
      );
    }
  }

  // ---- Wholesale SME catalogue (MTN and Airtel only) -------------------
  if (action === "get_sme_plans") {
    const provider = String(body.provider ?? "mtn");
    const networkId = bigisubNetworkId(provider);

    if (networkId === null) {
      throw new ApiError(
        `SME data is only available on MTN and Airtel. Choose the direct bundle for ${provider.toUpperCase()}.`,
        400,
        "SME_NOT_AVAILABLE",
      );
    }
    if (!isBigisubConfigured()) {
      throw new ApiError("SME data is not available right now.", 503, "SME_UNAVAILABLE");
    }

    const settings = await loadSettings(admin);
    const cacheId = `bigisub:${networkId}`;

    try {
      const plans = await fetchSmePlans(networkId, settings.data_surcharge_ngn);
      if (plans.length === 0) throw new Error("empty SME catalogue");
      await cacheCatalogue(admin, cacheId, "bigisub", String(networkId), plans);
      return json({ success: true, network: networkId, surcharge: settings.data_surcharge_ngn, plans, stale: false });
    } catch (err) {
      console.warn(`[vtu] SME plans unavailable for network ${networkId}`, err);
      const cached = await cachedCatalogue(admin, cacheId);
      if (cached) {
        return json({
          success: true,
          network: networkId,
          surcharge: settings.data_surcharge_ngn,
          plans: cached.variations,
          stale: true,
          fetchedAt: cached.fetchedAt,
        });
      }
      throw new ApiError(
        "SME data plans are temporarily unavailable. Please try again shortly.",
        503,
        "CATALOGUE_UNAVAILABLE",
      );
    }
  }

  // ---- Follow a transaction --------------------------------------------
  if (action === "status") {
    const reference = String(body?.reference ?? "");
    const { data: tx } = await admin
      .from("transactions")
      .select("reference, status, amount, token, units, failure_reason, updated_at")
      .eq("reference", reference)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!tx) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");

    return json({
      success: true,
      reference: tx.reference,
      status: tx.status,
      message: CUSTOMER_STATUS_COPY[tx.status as TransactionStatus] ?? "",
      amount: Number(tx.amount),
      token: tx.token,
      units: tx.units,
      updatedAt: tx.updated_at,
    });
  }

  // ---- Purchase --------------------------------------------------------
  const { mode, coherence } = readFulfilmentEnvironment(Deno.env);

  if (!coherence.ok) {
    console.error("[vtu] refusing to fulfil:", coherence.reason);
    throw new ApiError(
      "Quick services are misconfigured and have been disabled.",
      503,
      "FULFILMENT_MISCONFIGURED",
    );
  }
  if (mode !== "live") {
    throw new ApiError(disabledMessage(mode), 503, "FULFILMENT_DISABLED");
  }
  if (!isMonoConfigured()) {
    // No payment rail means no way to take the money, and vending without
    // taking it is what this whole rework exists to stop.
    throw new ApiError(
      "Payments are temporarily unavailable. Nothing was charged.",
      503,
      "PAYMENT_UNAVAILABLE",
    );
  }

  const input = parse(purchaseSchema, body);
  const route = routeFor(input);

  await rateLimit(admin, `vtu:purchase:${caller.id}`, 10, 60);

  const profile = await loadCustomerProfile(admin, caller.id);
  if (!profile) {
    throw new ApiError("No MiliPay customer profile is linked to this login", 403, "PROFILE_MISSING");
  }

  const settings = await loadSettings(admin);
  const priced = await priceTransaction(input, settings);

  // ---- Our own wallet, checked BEFORE the customer's bank --------------
  // Leg 1 moves the customer's money to us; leg 2 spends our pre-funded
  // VTPass balance. They are separate pots. An empty VTPass wallet means we
  // take the money and cannot deliver, so the sale is refused first.
  if (route === "vtpass") {
    const walletNgn = await fetchVtpassWalletBalance();
    if (walletNgn !== null && walletNgn < priced.baseAmount) {
      console.error(
        `[vtu] VTPASS WALLET TOO LOW: ${walletNgn} < ${priced.baseAmount} — refusing sale`,
      );
      throw new ApiError(
        "This service is briefly unavailable. Nothing was charged — please try again shortly.",
        503,
        "FULFILMENT_CAPACITY",
      );
    }
  }

  // Tier caps, daily cap, and the PIN challenge above the customer's
  // threshold. Unchanged — this was already correct.
  await enforceTransactionLimits(admin, {
    authUserId: caller.id,
    customerId: profile.id,
    amount: priced.amount,
    kycTier: profile.kycTier,
    pinThreshold: profile.pinThreshold,
    singleLimit: profile.singleLimit,
    dailyLimit: profile.dailyLimit,
    pin: input.pin,
  });

  // The server owns the reference. It used to be accepted from the client and
  // generated only as a fallback, so a retry that omitted it produced a fresh
  // reference and a second charge.
  const reference = `MP-BIL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const isTelecom = input.serviceType === "airtime" || input.serviceType === "data";
  const destination = isTelecom ? normalizeNigerianPhone(input.destination) : input.destination;
  const title = merchantTitle(input, priced.planLabel);
  const now = new Date().toISOString();

  // ---- The row exists BEFORE any money moves --------------------------
  const { data: created, error: insertError } = await admin
    .from("transactions")
    .insert({
      reference,
      user_id: caller.id,
      customer_id: profile.id,
      merchant_name: title,
      amount: priced.amount,
      base_amount: priced.baseAmount,
      fee_amount: roundNaira(priced.amount - priced.baseAmount),
      status: "initiated",
      service_type: input.serviceType,
      provider: input.provider,
      beneficiary: destination,
      variation_code: input.serviceType === "power" ? input.meterType : input.variationCode ?? null,
      fulfilment_provider: route,
      payment_provider: "mono",
      account_used: input.accountId,
      initiated_at: now,
      created_at: now,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    console.error("[vtu] could not open transaction", insertError);
    throw new ApiError("Could not start this purchase. Nothing was charged.", 503, "PURCHASE_FAILED");
  }

  await admin.from("transaction_events").insert({
    transaction_id: created.id,
    reference,
    from_status: null,
    to_status: "initiated",
    actor: "vtu-service",
    metadata: { serviceType: input.serviceType, provider: input.provider, route },
  });

  // ---- Leg 1: ask the bank ---------------------------------------------
  const { data: account } = await admin
    .from("linked_accounts")
    .select("id, account_name, mono_account_id")
    .eq("id", input.accountId)
    .eq("user_id", caller.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!account) {
    await transitionTransaction(admin, {
      reference,
      from: "initiated",
      to: "payment_failed",
      reason: "account not linked",
      actor: "vtu-service",
    });
    throw new ApiError("That bank account is not linked to your profile.", 403, "ACCOUNT_NOT_FOUND");
  }

  let mandateId: string | null = null;
  if (monoPaymentMode() === "mandate") {
    const { data: mandate } = await admin
      .from("mono_mandates")
      .select("mono_mandate_id, max_per_debit")
      .eq("linked_account_id", account.id)
      .eq("status", "active")
      .maybeSingle();

    if (!mandate) {
      await transitionTransaction(admin, {
        reference,
        from: "initiated",
        to: "payment_failed",
        reason: "no active mandate",
        actor: "vtu-service",
      });
      throw new ApiError(
        "This account needs to be re-authorised before it can be used to pay.",
        402,
        "MANDATE_REQUIRED",
      );
    }
    if (mandate.max_per_debit !== null && priced.amount > Number(mandate.max_per_debit)) {
      await transitionTransaction(admin, {
        reference,
        from: "initiated",
        to: "payment_failed",
        reason: "above mandate ceiling",
        actor: "vtu-service",
      });
      throw new ApiError(
        `This is above the limit your bank approved for this account (₦${Number(mandate.max_per_debit).toLocaleString()}).`,
        402,
        "MANDATE_LIMIT",
      );
    }
    mandateId = mandate.mono_mandate_id;
  }

  try {
    const debit = await initiateDebit({
      reference,
      amount: priced.amount,
      description: title,
      customer: { name: account.account_name, phone: input.customerPhone ?? null },
      mandateId,
    });

    await admin
      .from("transactions")
      .update({ mono_payment_id: debit.monoPaymentId, payment_reference: reference })
      .eq("reference", reference);

    // The customer's part is finished. The app follows the reference from here.
    return json({
      success: true,
      reference,
      status: "initiated",
      message: CUSTOMER_STATUS_COPY.initiated,
      amount: priced.amount,
      baseAmount: priced.baseAmount,
      serviceType: input.serviceType,
      provider: input.provider,
      beneficiary: input.destination,
      merchantTitle: title,
      // Present only in one-off DirectPay mode, where the customer must
      // authorise this specific payment at their bank.
      authorisationUrl: debit.authorisationUrl,
      timestamp: now,
    });
  } catch (err) {
    await transitionTransaction(admin, {
      reference,
      from: "initiated",
      to: "payment_failed",
      reason: err instanceof Error ? err.message : "debit failed",
      actor: "vtu-service",
    });
    throw toApiError(err, "Your bank declined this payment. Nothing was charged.");
  }
}));
