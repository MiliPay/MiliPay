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
import {
  disabledMessage,
  readFulfilmentEnvironment,
} from "../_shared/environment.ts";
import {
  bigisubNetworkId,
  fetchSmePlans,
  fetchVtpassVariations,
  FulfilmentError,
  isBigisubConfigured,
  normalizeNigerianPhone,
  payWithVtpass,
  purchaseSmeData,
  resolveVtpassServiceId,
  type Fulfilment,
  type Variation,
} from "../_shared/providers.ts";

/**
 * VTU vending: airtime, data (retail + SME), electricity and cable.
 *
 * The client never prices a transaction and never moves money. It names the
 * bundle it wants; this function resolves the operator price, adds the
 * configured margin, debits, fulfils, and reverses on failure.
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
  reference: z.string().min(6).max(64).optional(),
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

async function priceTransaction(
  input: PurchaseInput,
  settings: VtuSettings,
): Promise<Priced> {
  const serviceId = resolveVtpassServiceId(input.serviceType, input.provider);
  const surcharge = surchargeFor(input.serviceType, serviceId, settings);

  // Open-value services: the customer names the amount.
  if (input.serviceType === "airtime" || input.serviceType === "power") {
    if (!input.amount) {
      throw new ApiError("Amount is required for this service", 400, "AMOUNT_REQUIRED");
    }
    const base = Math.round(input.amount * 100) / 100;
    const fee = input.serviceType === "airtime"
      ? Math.round(base * (settings.airtime_surcharge_percent / 100) * 100) / 100
      : settings.power_convenience_fee_ngn;

    return {
      amount: Math.round((base + fee) * 100) / 100,
      baseAmount: base,
      serviceId,
      planLabel: input.serviceType === "airtime" ? "Airtime" : `Electricity (${input.meterType})`,
    };
  }

  // Fixed-price bundles: resolve the operator's own price for the requested
  // variation. Never trust a price supplied by the caller.
  if (!input.variationCode) {
    throw new ApiError("A bundle must be selected", 400, "VARIATION_REQUIRED");
  }

  let catalogue: Variation[];
  if (input.serviceType === "data" && input.dataCategory === "sme") {
    catalogue = await fetchSmePlans(bigisubNetworkId(input.provider), surcharge);
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
// Handler
// ─────────────────────────────────────────────────────────────

serve(handler(async (req) => {
  const caller: Caller = await requireCaller(req);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "purchase";

  // ---- Read the live margin configuration -------------------------------
  if (action === "get_settings") {
    return json({ success: true, settings: await loadSettings(admin) });
  }

  // ---- Update margins (administrators only) -----------------------------
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

  // ---- Retail catalogue -------------------------------------------------
  if (action === "get_variations") {
    const { serviceType = "data", provider = "mtn" } = body;
    const settings = await loadSettings(admin);
    const serviceId = body.serviceId || resolveVtpassServiceId(serviceType, provider);
    const surcharge = surchargeFor(serviceType, serviceId, settings);

    try {
      const variations = await fetchVtpassVariations(serviceId, surcharge);
      return json({ success: true, serviceId, surcharge, variations });
    } catch (err) {
      console.warn(`[vtu] variations unavailable for ${serviceId}`, err);
      // No silent fallback catalogue: a stale hardcoded price list would let a
      // customer buy a bundle at the wrong price.
      throw new ApiError(
        "Live bundle prices are temporarily unavailable. Please try again shortly.",
        503,
        "CATALOGUE_UNAVAILABLE",
      );
    }
  }

  // ---- Wholesale SME catalogue (previously called but never implemented) --
  if (action === "get_sme_plans") {
    if (!isBigisubConfigured()) {
      throw new ApiError("SME data is not available right now.", 503, "SME_UNAVAILABLE");
    }
    const settings = await loadSettings(admin);
    const networkId = Number(body.network) || bigisubNetworkId(body.provider ?? "mtn");

    try {
      const plans = await fetchSmePlans(networkId, settings.data_surcharge_ngn);
      if (plans.length === 0) {
        throw new Error("empty SME catalogue");
      }
      return json({ success: true, network: networkId, surcharge: settings.data_surcharge_ngn, plans });
    } catch (err) {
      console.warn(`[vtu] SME plans unavailable for network ${networkId}`, err);
      throw new ApiError(
        "SME data plans are temporarily unavailable. Please try again shortly.",
        503,
        "CATALOGUE_UNAVAILABLE",
      );
    }
  }

  // ---- Purchase ---------------------------------------------------------
  //
  // Vending spends MiliPay's own money at VTPass/BigiSub, and until the Mono
  // debit rail exists it spends it against linked_accounts.balance — a figure
  // copied once from the customer's bank at link time and never reconciled.
  // That is not a ledger, so this path stays shut until the rail is built.
  //
  // Catalogue browsing above is unaffected: it moves no money.
  const { mode, coherence } = readFulfilmentEnvironment(Deno.env);

  if (!coherence.ok) {
    // Misconfiguration, not a customer problem. Loud in logs, vague to the
    // caller, and it must never fall through to a provider call.
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

  const input = parse(purchaseSchema, body);

  await rateLimit(admin, `vtu:purchase:${caller.id}`, 10, 60);

  const profile = await loadCustomerProfile(admin, caller.id);
  if (!profile) {
    throw new ApiError("No MiliPay customer profile is linked to this login", 403, "PROFILE_MISSING");
  }

  const settings = await loadSettings(admin);
  const priced = await priceTransaction(input, settings);
  const reference = input.reference ?? `MP-BIL-${Date.now().toString().slice(-8)}${crypto.randomUUID().slice(0, 4)}`;

  // Idempotency: a retry of an already-settled reference must not re-charge.
  const { data: existing } = await admin
    .from("transactions")
    .select("reference, amount, status")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    return json({
      success: existing.status === "success",
      idempotent: true,
      reference,
      amount: Number(existing.amount),
      message: "This payment reference has already been processed.",
    });
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

  // ---- Debit (atomic; ownership is enforced inside the RPC) -------------
  const { data: newBalance, error: debitError } = await admin.rpc("debit_linked_account", {
    p_account_id: input.accountId,
    p_user_id: caller.id,
    p_amount: priced.amount,
  });

  if (debitError) {
    const message = String(debitError.message ?? "");
    if (message.includes("INSUFFICIENT_FUNDS")) {
      throw new ApiError(
        "Insufficient funds in the selected account.",
        400,
        "INSUFFICIENT_FUNDS",
      );
    }
    if (message.includes("ACCOUNT_NOT_FOUND")) {
      throw new ApiError("That bank account is not linked to your profile.", 403, "ACCOUNT_NOT_FOUND");
    }
    console.error("[vtu] debit failed", debitError);
    throw new ApiError("Could not debit your account. No funds were moved.", 503, "DEBIT_FAILED");
  }

  // From here on, money has moved: every failure path must reverse it.
  const reverse = async (why: string) => {
    try {
      await admin.rpc("credit_linked_account", {
        p_account_id: input.accountId,
        p_amount: priced.amount,
      });
      console.warn(`[vtu] auto-reversed ${priced.amount} NGN on ${reference}: ${why}`);
      return true;
    } catch (err) {
      // Money is stuck. Loud, because it needs manual settlement.
      console.error(`[vtu] REVERSAL FAILED for ${reference}`, err);
      return false;
    }
  };

  // ---- Fulfil -----------------------------------------------------------
  const isTelecom = input.serviceType === "airtime" || input.serviceType === "data";
  const destination = isTelecom ? normalizeNigerianPhone(input.destination) : input.destination;
  const contactPhone = isTelecom
    ? destination
    : normalizeNigerianPhone(input.customerPhone) || destination;

  let fulfilment: Fulfilment;
  try {
    if (input.serviceType === "data" && input.dataCategory === "sme") {
      fulfilment = await purchaseSmeData({
        networkId: bigisubNetworkId(input.provider),
        planId: Number(input.variationCode),
        phone: destination,
      });
    } else {
      fulfilment = await payWithVtpass({
        serviceType: input.serviceType,
        serviceId: priced.serviceId,
        reference,
        billersCode: destination,
        phone: contactPhone,
        baseAmount: priced.baseAmount,
        variationCode: input.variationCode,
        meterType: input.meterType,
      });
    }
  } catch (err) {
    const refunded = await reverse(err instanceof Error ? err.message : "fulfilment error");
    const detail = err instanceof FulfilmentError
      ? err.message
      : "The operator could not complete this request";

    throw new ApiError(
      refunded
        ? `${detail}. Your payment was automatically refunded.`
        : `${detail}. Your refund is being processed and will reflect shortly.`,
      502,
      "FULFILMENT_FAILED",
      { refunded },
    );
  }

  // ---- Record the transaction ------------------------------------------
  const title = merchantTitle(input, priced.planLabel);
  const { error: txError } = await admin.from("transactions").insert({
    reference,
    user_id: caller.id,
    customer_id: profile.id,
    merchant_name: fulfilment.token ? `${title} [Token: ${fulfilment.token}]` : title,
    amount: priced.amount,
    status: "success",
    account_used: input.accountId,
    created_at: new Date().toISOString(),
  });

  if (txError) {
    // The operator already delivered, so we cannot reverse: record the gap
    // loudly instead of silently swallowing it as the old code did.
    console.error(
      `[vtu] LEDGER WRITE FAILED after successful fulfilment. reference=${reference} ` +
        `user=${caller.id} amount=${priced.amount} operatorRef=${fulfilment.operatorReference}`,
      txError,
    );
  }

  return json({
    success: true,
    reference,
    operatorReference: fulfilment.operatorReference,
    amount: priced.amount,
    baseAmount: priced.baseAmount,
    serviceType: input.serviceType,
    provider: input.provider,
    beneficiary: input.destination,
    merchantTitle: title,
    token: fulfilment.token ?? null,
    units: fulfilment.units ?? null,
    newBalance: Number(newBalance),
    ledgerRecorded: !txError,
    timestamp: new Date().toISOString(),
  });
}));
