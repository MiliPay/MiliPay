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
  statusForIndeterminateFulfilment,
  statusForProviderStatus,
  type TransactionStatus,
} from "../_shared/vtu-state.ts";
import { enqueueRefund, transitionTransaction } from "../_shared/transactions.ts";
import * as bigisub from "../_shared/bigisub.ts";
import type { CableProvider, PlanType, Variation } from "../_shared/bigisub.ts";

/**
 * Quick services: airtime, data, electricity and cable.
 *
 * BigiSub is the single fulfilment gateway — VTPass is gone. Mono moves the
 * customer's money. Those are two separate pots, and the order between them is
 * the whole design:
 *
 *   1. price it here — the client never says what it pays
 *   2. check OUR BigiSub wallet, before the customer's bank is touched
 *   3. write the transaction as `initiated` — before any money moves
 *   4. Mono debits the customer's chosen bank account
 *   5. ... webhook confirms ... -> `paid`
 *   6. only now spend our own BigiSub balance
 *
 * Steps 4 and 5 are why a purchase is no longer one blocking request. The
 * customer's part ends at the fingerprint; the app follows the reference live.
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

function surchargeFor(serviceType: string, settings: VtuSettings): number {
  if (serviceType === "data") return settings.data_surcharge_ngn;
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

const PLAN_TYPES = ["SME", "GIFTING", "DataTransfer", "SME2", "CGIFTING", "DataCOUPON", "SNS"] as const;

const purchaseSchema = z.object({
  serviceType: z.enum(["airtime", "data", "power", "cable"]),
  provider: z.string().min(2).max(32),
  destination: z.string().min(3).max(32),
  customerPhone: z.string().max(20).optional(),
  variationCode: z.string().max(64).optional(),
  /** Legacy shorthand from the app: sme -> SME, direct -> GIFTING. */
  dataCategory: z.enum(["sme", "direct"]).optional(),
  planType: z.enum(PLAN_TYPES).optional(),
  meterType: z.enum(["prepaid", "postpaid"]).default("prepaid"),
  /**
   * Required for power and cable: BigiSub's pay/purchase endpoints demand the
   * verified customer name, so the client must call verify_meter or
   * verify_cable first.
   */
  customerName: z.string().max(200).optional(),
  customerAddress: z.string().max(400).optional(),
  accountId: z.string().uuid(),
  // Airtime and power are open-value; bundles are priced from the catalogue.
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

function planTypeFor(input: { planType?: PlanType; dataCategory?: "sme" | "direct" }): PlanType {
  if (input.planType) return input.planType;
  return input.dataCategory === "direct" ? "GIFTING" : "SME";
}

function requireNetwork(provider: string): number {
  const id = bigisub.networkId(provider);
  if (id === null) {
    throw new ApiError(`${provider.toUpperCase()} is not a supported network.`, 400, "UNSUPPORTED_NETWORK");
  }
  return id;
}

function requireCable(provider: string): CableProvider {
  const value = String(provider).toLowerCase().trim();
  if (!(bigisub.CABLE_PROVIDERS as readonly string[]).includes(value)) {
    throw new ApiError(`${provider.toUpperCase()} is not a supported TV provider.`, 400, "UNSUPPORTED_PROVIDER");
  }
  return value as CableProvider;
}

// ─────────────────────────────────────────────────────────────
// Server-side pricing: the client never decides what it pays
// ─────────────────────────────────────────────────────────────

interface Priced {
  /** what the customer is charged */
  amount: number;
  /** what BigiSub takes from our wallet */
  baseAmount: number;
  /** BigiSub's own charge, where it levies one */
  serviceCharge: number;
  planLabel: string;
}

async function priceTransaction(input: PurchaseInput, settings: VtuSettings): Promise<Priced> {
  const surcharge = surchargeFor(input.serviceType, settings);

  if (input.serviceType === "airtime") {
    if (!input.amount) throw new ApiError("Amount is required", 400, "AMOUNT_REQUIRED");
    const base = roundNaira(input.amount);
    const fee = roundNaira(base * (settings.airtime_surcharge_percent / 100));
    return { amount: roundNaira(base + fee), baseAmount: base, serviceCharge: 0, planLabel: "Airtime" };
  }

  if (input.serviceType === "power") {
    if (!input.amount) throw new ApiError("Amount is required", 400, "AMOUNT_REQUIRED");
    const base = roundNaira(input.amount);

    // The disco's own service charge comes from BigiSub, not from us, and the
    // customer has to see it before they authorise. Guessing it would mean
    // charging one figure and being billed another.
    const providers = await bigisub.listElectricityProviders();
    const disco = providers.find((p) => p.code === input.provider);
    if (!disco) {
      throw new ApiError("That electricity provider is not available.", 400, "UNSUPPORTED_PROVIDER");
    }
    if (base < disco.minAmount) {
      throw new ApiError(
        `${disco.name} requires at least ₦${disco.minAmount.toLocaleString()}.`,
        400,
        "BELOW_MINIMUM",
      );
    }

    const serviceCharge = disco.serviceChargeType === "percentage"
      ? roundNaira(base * (disco.serviceCharge / 100))
      : disco.serviceCharge;

    return {
      amount: roundNaira(base + serviceCharge + settings.power_convenience_fee_ngn),
      baseAmount: base,
      serviceCharge,
      planLabel: `${disco.name} (${input.meterType})`,
    };
  }

  // Fixed-price bundles: resolve the live catalogue. The cache is for
  // browsing; it never prices a purchase.
  if (!input.variationCode) throw new ApiError("A bundle must be selected", 400, "VARIATION_REQUIRED");

  let catalogue: Variation[];
  if (input.serviceType === "data") {
    catalogue = await bigisub.listDataPlans(requireNetwork(input.provider), planTypeFor(input), surcharge);
  } else {
    catalogue = await bigisub.listCablePlans(requireCable(input.provider), surcharge);
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
    serviceCharge: 0,
    planLabel: chosen.name,
  };
}

function merchantTitle(input: PurchaseInput, planLabel: string): string {
  const provider = input.provider.toUpperCase();
  switch (input.serviceType) {
    case "data":
      return `${provider} Data (${planTypeFor(input)})`;
    case "power":
      return `${planLabel}`;
    case "cable":
      return `${provider} ${planLabel}`;
    default:
      return `${provider} Airtime`;
  }
}

// ─────────────────────────────────────────────────────────────
// Catalogue cache — browsing only
// ─────────────────────────────────────────────────────────────

async function cacheCatalogue(admin: SupabaseClient, id: string, serviceId: string, payload: unknown) {
  try {
    await admin.from("provider_catalogue_cache").upsert({
      id,
      provider: "bigisub",
      service_id: serviceId,
      payload,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[vtu] catalogue cache write failed", err);
  }
}

async function cachedCatalogue(admin: SupabaseClient, id: string) {
  const { data } = await admin
    .from("provider_catalogue_cache")
    .select("payload, fetched_at")
    .eq("id", id)
    .maybeSingle();
  if (!data?.payload) return null;
  return { variations: data.payload as Variation[], fetchedAt: data.fetched_at as string };
}

// ─────────────────────────────────────────────────────────────
// Fulfilment (internal — triggered by the Mono webhook once paid)
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
  merchant_name: string | null;
  operator_transaction_id: string | null;
  initiated_at: string | null;
}

async function settle(
  admin: SupabaseClient,
  tx: TransactionRow,
  status: TransactionStatus,
  patch: Record<string, unknown>,
  reason?: string,
): Promise<TransactionStatus> {
  await transitionTransaction(admin, {
    reference: tx.reference,
    from: "fulfilling",
    to: status,
    reason,
    actor: "vtu-service",
    patch,
  });

  // We took the money and could not deliver. The only honest exit is giving
  // it back, and it goes on a queue with retries rather than a log line.
  if (status === "fulfilment_failed") {
    const queued = await enqueueRefund(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      amount: Number(tx.amount),
      reason: reason ?? "fulfilment failed",
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
  return status;
}

async function fulfilTransaction(admin: SupabaseClient, reference: string): Promise<TransactionStatus> {
  const { data } = await admin
    .from("transactions")
    .select(
      "id, reference, status, amount, base_amount, service_type, provider, beneficiary, variation_code, merchant_name, operator_transaction_id, initiated_at",
    )
    .eq("reference", reference)
    .maybeSingle();

  if (!data) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");
  const tx = data as TransactionRow;

  // Fulfilment is only ever reachable from paid.
  if (tx.status !== "paid") return tx.status;

  const moved = await transitionTransaction(admin, {
    reference,
    from: "paid",
    to: "fulfilling",
    actor: "vtu-service",
  });
  if (!moved.ok) return tx.status; // another worker got there first

  const phone = bigisub.normalizeNigerianPhone(tx.beneficiary ?? "");
  const base = Number(tx.base_amount ?? tx.amount);

  try {
    let result: bigisub.Fulfilment;

    switch (tx.service_type) {
      case "airtime":
        result = await bigisub.purchaseAirtime({
          network: requireNetwork(tx.provider ?? ""),
          phone,
          amount: base,
        });
        break;
      case "data":
        result = await bigisub.purchaseData({
          network: requireNetwork(tx.provider ?? ""),
          planId: Number(tx.variation_code),
          phone: phone,
        });
        break;
      case "cable":
        result = await bigisub.purchaseCable({
          cableType: requireCable(tx.provider ?? ""),
          cardNo: tx.beneficiary ?? "",
          phone,
          amount: base,
          customerName: tx.merchant_name ?? "MiliPay customer",
        });
        break;
      case "power":
        result = await bigisub.payElectricity({
          company: tx.provider ?? "",
          meterNo: tx.beneficiary ?? "",
          meterType: (tx.variation_code as "prepaid" | "postpaid") ?? "prepaid",
          phone,
          amount: base,
          customerName: tx.merchant_name ?? "MiliPay customer",
        });
        break;
      default:
        return await settle(admin, tx, "fulfilment_failed", {}, "unsupported service type");
    }

    return await settle(admin, tx, statusForProviderStatus(result.providerStatus), {
      operator_reference: result.operatorReference,
      operator_transaction_id: result.tranxId,
      token: result.token ?? null,
      units: result.units ?? null,
      service_charge: result.serviceCharge ?? null,
    });
  } catch (err) {
    const indeterminate = err instanceof bigisub.FulfilmentError && err.indeterminate;

    // THE IMPORTANT BRANCH. An indeterminate call is NOT a failure: BigiSub may
    // have fulfilled and we simply did not hear. There is no idempotency key
    // on their purchase endpoints, so this can never be retried — it is left
    // pending, with no transaction id, for a human to resolve against their
    // dashboard. Declaring failure here would refund a customer who was in
    // fact credited.
    if (indeterminate) {
      console.error(
        `[vtu] INDETERMINATE FULFILMENT on ${reference} — do not retry, resolve manually: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    return await settle(
      admin,
      tx,
      indeterminate ? statusForIndeterminateFulfilment() : "fulfilment_failed",
      {},
      err instanceof Error ? err.message : "fulfilment error",
    );
  }
}

/** Resolves a pending transaction using BigiSub's own transaction id. */
async function requeryTransaction(admin: SupabaseClient, reference: string): Promise<TransactionStatus> {
  const { data } = await admin
    .from("transactions")
    .select("id, reference, status, amount, operator_transaction_id")
    .eq("reference", reference)
    .maybeSingle();

  if (!data) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");
  const tx = data as TransactionRow;
  if (tx.status !== "fulfilment_pending") return tx.status;

  // No transaction id means the purchase call never returned one, which means
  // we do not know whether it happened. That cannot be resolved from here.
  if (!tx.operator_transaction_id) return tx.status;

  let result: bigisub.RequeryResult;
  try {
    result = await bigisub.requeryTransaction(tx.operator_transaction_id);
  } catch {
    return tx.status; // still unknown; the sweep tries again
  }

  const status = statusForProviderStatus(result.status);
  if (status === "fulfilment_pending") return status;

  await transitionTransaction(admin, {
    reference,
    from: "fulfilment_pending",
    to: status,
    actor: "requery",
    patch: { token: result.token ?? null, units: result.units ?? null },
    metadata: { providerStatus: result.status },
  });

  if (status === "fulfilment_failed") {
    const queued = await enqueueRefund(admin, {
      transactionId: tx.id,
      reference,
      amount: Number(tx.amount),
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

  // ---- Internal ---------------------------------------------------------
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

  if (action === "get_settings") {
    return json({ success: true, settings: await loadSettings(admin) });
  }

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

  // ---- Catalogues -------------------------------------------------------
  if (action === "get_variations" || action === "get_sme_plans") {
    const settings = await loadSettings(admin);
    const serviceType = String(body.serviceType ?? (action === "get_sme_plans" ? "data" : "data"));
    const provider = String(body.provider ?? "mtn");
    const surcharge = surchargeFor(serviceType, settings);

    const planType = planTypeFor({
      planType: body.planType,
      dataCategory: action === "get_sme_plans" ? "sme" : body.dataCategory,
    });

    const cacheId = serviceType === "cable"
      ? `bigisub:cable:${provider}`
      : `bigisub:data:${provider}:${planType}`;

    try {
      const variations = serviceType === "cable"
        ? await bigisub.listCablePlans(requireCable(provider), surcharge)
        : await bigisub.listDataPlans(requireNetwork(provider), planType, surcharge);

      if (variations.length === 0) throw new Error("empty catalogue");
      await cacheCatalogue(admin, cacheId, `${serviceType}:${provider}`, variations);
      return json({ success: true, provider, planType, surcharge, variations, plans: variations, stale: false });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // A slow gateway used to be a hard 503, so a customer could not even
      // browse. The cache is for BROWSING ONLY: the price charged is
      // re-resolved live at purchase.
      console.warn(`[vtu] catalogue unavailable for ${cacheId}`, err);
      const cached = await cachedCatalogue(admin, cacheId);
      if (cached) {
        return json({
          success: true,
          provider,
          planType,
          surcharge,
          variations: cached.variations,
          plans: cached.variations,
          stale: true,
          fetchedAt: cached.fetchedAt,
        });
      }
      throw new ApiError(
        "Live prices are temporarily unavailable. Please try again shortly.",
        503,
        "CATALOGUE_UNAVAILABLE",
      );
    }
  }

  if (action === "get_electricity_providers") {
    try {
      return json({ success: true, providers: await bigisub.listElectricityProviders() });
    } catch {
      throw new ApiError("Electricity providers are unavailable right now.", 503, "CATALOGUE_UNAVAILABLE");
    }
  }

  // ---- Verification (required before power and cable purchases) ---------
  if (action === "verify_meter") {
    await rateLimit(admin, `vtu:verify:${caller.id}`, 20, 60);
    try {
      const verified = await bigisub.verifyMeter({
        company: String(body.provider ?? ""),
        meterNo: String(body.destination ?? ""),
        meterType: body.meterType === "postpaid" ? "postpaid" : "prepaid",
      });
      return json({ success: true, ...verified });
    } catch (err) {
      throw new ApiError(
        err instanceof Error ? err.message : "That meter could not be verified.",
        400,
        "VERIFICATION_FAILED",
      );
    }
  }

  if (action === "verify_cable") {
    await rateLimit(admin, `vtu:verify:${caller.id}`, 20, 60);
    try {
      const verified = await bigisub.verifyCable({
        cableName: requireCable(String(body.provider ?? "")),
        cardNo: String(body.destination ?? ""),
      });
      return json({ success: true, ...verified });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        err instanceof Error ? err.message : "That smartcard could not be verified.",
        400,
        "VERIFICATION_FAILED",
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
    throw new ApiError("Quick services are misconfigured and have been disabled.", 503, "FULFILMENT_MISCONFIGURED");
  }
  if (mode !== "live") {
    throw new ApiError(disabledMessage(mode), 503, "FULFILMENT_DISABLED");
  }
  if (!bigisub.isConfigured()) {
    throw new ApiError("Quick services are unavailable right now.", 503, "FULFILMENT_UNAVAILABLE");
  }
  if (!isMonoConfigured()) {
    // No payment rail means no way to take the money, and vending without
    // taking it is what this whole rework exists to stop.
    throw new ApiError("Payments are temporarily unavailable. Nothing was charged.", 503, "PAYMENT_UNAVAILABLE");
  }

  const input = parse(purchaseSchema, body);

  if ((input.serviceType === "power" || input.serviceType === "cable") && !input.customerName) {
    // BigiSub's pay/purchase endpoints require the verified name, so skipping
    // verification would fail at the gateway — after the customer had paid.
    throw new ApiError(
      "This account needs to be verified before payment.",
      400,
      "VERIFICATION_REQUIRED",
    );
  }

  await rateLimit(admin, `vtu:purchase:${caller.id}`, 10, 60);

  const profile = await loadCustomerProfile(admin, caller.id);
  if (!profile) {
    throw new ApiError("No MiliPay customer profile is linked to this login", 403, "PROFILE_MISSING");
  }

  const settings = await loadSettings(admin);
  const priced = await priceTransaction(input, settings);

  // ---- OUR wallet, checked BEFORE the customer's bank ------------------
  // Leg 1 moves the customer's money to us; leg 2 spends our pre-funded
  // BigiSub balance. Separate pots. An empty wallet means taking the money
  // and being unable to deliver.
  const wallet = await bigisub.walletBalance();
  if (wallet !== null && wallet.balance < priced.baseAmount + priced.serviceCharge) {
    console.error(
      `[vtu] BIGISUB WALLET TOO LOW: ${wallet.balance} < ${priced.baseAmount + priced.serviceCharge} — refusing sale`,
    );
    throw new ApiError(
      "This service is briefly unavailable. Nothing was charged — please try again shortly.",
      503,
      "FULFILMENT_CAPACITY",
    );
  }

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
  const destination = isTelecom ? bigisub.normalizeNigerianPhone(input.destination) : input.destination;
  const title = merchantTitle(input, priced.planLabel);
  const now = new Date().toISOString();

  const { data: created, error: insertError } = await admin
    .from("transactions")
    .insert({
      reference,
      user_id: caller.id,
      customer_id: profile.id,
      // For power and cable this carries the verified account holder, which
      // BigiSub's own endpoints require back at fulfilment time.
      merchant_name: input.customerName ?? title,
      amount: priced.amount,
      base_amount: priced.baseAmount,
      fee_amount: roundNaira(priced.amount - priced.baseAmount - priced.serviceCharge),
      service_charge: priced.serviceCharge,
      status: "initiated",
      service_type: input.serviceType,
      provider: input.provider,
      beneficiary: destination,
      variation_code: input.serviceType === "power" ? input.meterType : input.variationCode ?? null,
      fulfilment_provider: "bigisub",
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
    metadata: { serviceType: input.serviceType, provider: input.provider, title },
  });

  // ---- Leg 1: ask the bank ---------------------------------------------
  const { data: account } = await admin
    .from("linked_accounts")
    .select("id, account_name")
    .eq("id", input.accountId)
    .eq("user_id", caller.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!account) {
    await transitionTransaction(admin, {
      reference, from: "initiated", to: "payment_failed",
      reason: "account not linked", actor: "vtu-service",
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
        reference, from: "initiated", to: "payment_failed",
        reason: "no active mandate", actor: "vtu-service",
      });
      throw new ApiError(
        "This account needs to be re-authorised before it can be used to pay.",
        402,
        "MANDATE_REQUIRED",
      );
    }
    if (mandate.max_per_debit !== null && priced.amount > Number(mandate.max_per_debit)) {
      await transitionTransaction(admin, {
        reference, from: "initiated", to: "payment_failed",
        reason: "above mandate ceiling", actor: "vtu-service",
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
      serviceCharge: priced.serviceCharge,
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
      reference, from: "initiated", to: "payment_failed",
      reason: err instanceof Error ? err.message : "debit failed", actor: "vtu-service",
    });
    throw toApiError(err, "Your bank declined this payment. Nothing was charged.");
  }
}));
