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
  statusForVtpassResponse,
  type TransactionStatus,
} from "../_shared/vtu-state.ts";
import { enqueueRefund, transitionTransaction } from "../_shared/transactions.ts";
// BigiSub is PARKED, not deleted: supabase/functions/_shared/bigisub.ts is
// still in the repo, but nothing live imports it and
// tests/gateway-isolation.test.ts fails if anything starts to. It was parked
// because no BigiSub purchase endpoint accepts a client-supplied reference, so
// an uncertain call can never be resolved by machine.
import * as vtpass from "../_shared/vtpass.ts";
import type { Variation } from "../_shared/vtpass.ts";

/**
 * Quick services: airtime, data, electricity and cable.
 *
 * VTPass is the fulfilment gateway; Mono moves the customer's money. Those are
 * two separate pots, and the order between them is the whole design:
 *
 *   1. price it here — the client never says what it pays
 *   2. check OUR VTPass wallet, before the customer's bank is touched
 *   3. write the transaction as `initiated` — before any money moves
 *   4. Mono debits the customer's chosen bank account
 *   5. ... webhook confirms ... -> `paid`
 *   6. only now spend our own VTPass balance
 *
 * Step 6 is reachable ONLY from `paid`, and fulfilTransaction enforces that by
 * reading the row's status itself rather than trusting its caller. That is the
 * invariant the whole file exists to protect: irreversible value is never
 * dispensed before the money is confirmed, because airtime cannot be un-sold.
 *
 * Steps 4 and 5 are why a purchase is no longer one blocking request. The
 * customer's part ends at the fingerprint; the app follows the reference live.
 *
 * The same code runs against both faces of both providers. Which face is
 * decided by MILIPAY_ENVIRONMENT and enforced by environment.ts — there is no
 * separate sandbox code path, and no stubbed provider, because a rail proved
 * against a mock is not proved at all.
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

const purchaseSchema = z.object({
  serviceType: z.enum(["airtime", "data", "power", "cable"]),
  provider: z.string().min(2).max(32),
  destination: z.string().min(3).max(32),
  customerPhone: z.string().max(20).optional(),
  variationCode: z.string().max(64).optional(),
  // No dataCategory / planType. Those were BigiSub's plan shelves; VTPass has
  // one data catalogue per network and variationCode identifies the bundle.
  // An older app that still sends them is unaffected: z.object strips keys it
  // does not declare rather than rejecting them.
  meterType: z.enum(["prepaid", "postpaid"]).default("prepaid"),
  /**
   * Required for power and cable. The customer must have seen whose meter or
   * card they are crediting while a typo was still free to fix; the purchase
   * path re-verifies server-side regardless.
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

/**
 * MiliPay's provider id -> the VTPass serviceID that delivers it.
 *
 * Refuses rather than guessing. A provider with no mapping must produce a
 * clear 400 here, not a request to a serviceID VTPass has never heard of.
 */
function requireServiceId(serviceType: string, provider: string): string {
  const serviceId = vtpass.resolveServiceId(serviceType, provider);
  if (!serviceId) {
    throw new ApiError(
      `${String(provider).toUpperCase()} is not available for ${serviceType}.`,
      400,
      "UNSUPPORTED_PROVIDER",
    );
  }
  return serviceId;
}

/**
 * Mono will not debit less than this.
 *
 * Their floor, not ours — enforced here so a customer is told before they
 * authorise rather than after, when the debit comes back rejected and the
 * transaction has to be unwound. Our own ₦50 minimum still applies on top for
 * anything Mono would accept.
 *
 * https://docs.mono.co/docs/payments/direct-debit/debit-an-account
 */
const MONO_MINIMUM_DEBIT_NGN = 200;

// ─────────────────────────────────────────────────────────────
// Server-side pricing: the client never decides what it pays
// ─────────────────────────────────────────────────────────────

interface Priced {
  /** what the customer is charged */
  amount: number;
  /** what VTPass takes from our wallet */
  baseAmount: number;
  /** A biller's own charge, where one is levied separately. VTPass does not
   *  break one out, so this is 0 today; the column stays because the ledger
   *  distinguishes it from fee_amount, which is MiliPay margin. */
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

    // VTPass has no providers-with-charges endpoint of the kind BigiSub had,
    // so there is no disco service charge to add here. The biller's own floor
    // comes back from merchant-verify, which the client has already called —
    // and which the purchase path re-checks below, because a client-side check
    // is a courtesy, not a control.
    const serviceId = requireServiceId("power", input.provider);
    const verified = await vtpass
      .verifyMerchant({
        serviceId,
        billersCode: input.destination,
        type: input.meterType,
      })
      .catch((err) => {
        throw new ApiError(
          err instanceof Error ? err.message : "That meter could not be verified.",
          400,
          "VERIFICATION_FAILED",
        );
      });

    if (verified.minAmount !== null && base < verified.minAmount) {
      throw new ApiError(
        `This meter requires at least ₦${verified.minAmount.toLocaleString()}.`,
        400,
        "BELOW_MINIMUM",
      );
    }

    return {
      amount: roundNaira(base + settings.power_convenience_fee_ngn),
      baseAmount: base,
      serviceCharge: 0,
      planLabel: `${input.provider.toUpperCase()} (${input.meterType})`,
    };
  }

  // Fixed-price bundles: resolve the live catalogue. The cache is for
  // browsing; it never prices a purchase.
  if (!input.variationCode) throw new ApiError("A bundle must be selected", 400, "VARIATION_REQUIRED");

  const catalogue: Variation[] = await vtpass.listVariations(
    requireServiceId(input.serviceType, input.provider),
    surcharge,
  );

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
      // No plan-shelf suffix any more. SME/GIFTING was BigiSub's vocabulary;
      // VTPass has one data catalogue per network and the variation name
      // already says what the bundle is.
      return `${provider} ${planLabel}`;
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
      provider: "vtpass",
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
  customer_id: string | null;
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
  created_at: string | null;
}

/**
 * The timestamp a transaction's VTPass request_id is built from.
 *
 * initiated_at first, because that is what the purchase used; created_at as
 * the backstop because it is NOT NULL with a default, so it always exists on a
 * row that exists. Returning null is a refusal, not a fallback to "now" —
 * see requestId() in vtpass.ts for why "now" would be worse than failing.
 */
function issuedAtFor(tx: { initiated_at: string | null; created_at?: string | null }): string | null {
  return tx.initiated_at ?? tx.created_at ?? null;
}

/** The paying customer's own phone. customers.phone is NOT NULL. */
async function customerPhone(admin: SupabaseClient, customerId: string | null): Promise<string> {
  if (!customerId) return "";
  const { data } = await admin
    .from("customers")
    .select("phone")
    .eq("id", customerId)
    .maybeSingle();
  return typeof data?.phone === "string" ? data.phone : "";
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
      "id, reference, customer_id, status, amount, base_amount, service_type, provider, beneficiary, variation_code, merchant_name, operator_transaction_id, initiated_at, created_at",
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

  const isTelecom = tx.service_type === "airtime" || tx.service_type === "data";
  // Airtime and data: the beneficiary IS a phone. Power and cable: the
  // beneficiary is a meter or smartcard, and VTPass wants the CUSTOMER's phone
  // alongside it — that is where a prepaid token is texted. This used to
  // normalise the meter number and send that as the phone.
  const phone = isTelecom
    ? vtpass.normalizeNigerianPhone(tx.beneficiary ?? "")
    : vtpass.normalizeNigerianPhone(await customerPhone(admin, tx.customer_id));
  const base = Number(tx.base_amount ?? tx.amount);
  const serviceId = vtpass.resolveServiceId(tx.service_type ?? "", tx.provider ?? "");

  if (!serviceId) {
    return await settle(admin, tx, "fulfilment_failed", {}, "unsupported service or provider");
  }

  // The request_id — our only idempotency key at VTPass — is derived from this.
  // initiated_at is nullable in the schema, so created_at (NOT NULL, defaulted)
  // is the backstop. Without a stable timestamp every retry and every requery
  // would build a DIFFERENT id, which means no deduplication at the gateway and
  // a requery asking about a purchase VTPass has never heard of.
  const issuedAt = issuedAtFor(tx);
  if (!issuedAt) {
    // fulfilment_failed, not quarantined: we are already in `fulfilling`, and
    // fulfilling -> quarantined is not a legal transition, so quarantining
    // here would strand the row in `fulfilling` for ever. It is also the right
    // answer — VTPass was never called, so nothing was dispensed and the
    // honest exit is to give the money back, which settle() queues.
    console.error(`[vtu] no timestamp on ${reference}; cannot build a stable request_id`);
    return await settle(admin, tx, "fulfilment_failed", {}, "no stable gateway reference available");
  }

  try {
    // One call for all four services. VTPass distinguishes them by serviceID
    // and variation_code rather than by endpoint, so there is no switch here
    // and no way for a new service type to silently take a wrong branch.
    const result = await vtpass.pay({
      serviceType: tx.service_type ?? "",
      serviceId,
      reference: tx.reference,
      // Airtime and data are delivered to a phone; power and cable to a meter
      // or card, with the customer's phone carried alongside.
      billersCode: isTelecom ? phone : (tx.beneficiary ?? ""),
      phone,
      baseAmount: base,
      variationCode: tx.variation_code ?? undefined,
      meterType: tx.service_type === "power" ? (tx.variation_code ?? "prepaid") : undefined,
      issuedAt,
    });

    // Code 000 alone is NOT delivered — it means the request was accepted. The
    // outcome is the status field, and statusForVtpassResponse reads both.
    const status = statusForVtpassResponse(result.providerCode, result.providerStatus);

    return await settle(admin, tx, status, {
      operator_reference: result.operatorReference,
      operator_transaction_id: result.operatorReference,
      token: result.token ?? null,
      units: result.units ?? null,
    }, `vtpass code ${result.providerCode}, status ${result.providerStatus ?? "none"}`);
  } catch (err) {
    const indeterminate = err instanceof vtpass.FulfilmentError && err.indeterminate;

    // THE IMPORTANT BRANCH. An indeterminate call is NOT a failure: VTPass may
    // have fulfilled and we simply did not hear. Declaring failure here would
    // refund a customer who was in fact credited.
    //
    // Unlike BigiSub, this is always resolvable by machine. The request_id is
    // derived from the reference and initiated_at, so requery() can ask about
    // this exact purchase even though we never received a transaction id. What
    // must NOT happen is a second pay() — see rule 3 in vtpass.ts.
    if (indeterminate) {
      console.error(
        `[vtu] INDETERMINATE FULFILMENT on ${reference} — requery will resolve, DO NOT re-pay: ` +
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

/**
 * Resolve a pending transaction by asking VTPass about it directly.
 *
 * This is the recovery path for every uncertain purchase, and it is why a
 * timeout no longer triggers a blind reversal or a blind second purchase.
 *
 * It needs no operator transaction id. The request_id is derived from the
 * reference and initiated_at, which we always have — so a purchase whose call
 * timed out before returning anything is still resolvable. That was not true
 * with BigiSub, where no id meant no answer and a human had to go and look.
 */
async function requeryTransaction(admin: SupabaseClient, reference: string): Promise<TransactionStatus> {
  const { data } = await admin
    .from("transactions")
    .select("id, reference, status, amount, initiated_at, created_at")
    .eq("reference", reference)
    .maybeSingle();

  if (!data) throw new ApiError("Unknown reference", 404, "UNKNOWN_REFERENCE");
  const tx = data as TransactionRow;
  if (tx.status !== "fulfilment_pending") return tx.status;

  const issuedAt = issuedAtFor(tx);
  if (!issuedAt) {
    // Nothing to ask about: without the original timestamp we cannot rebuild
    // the request_id we sent. A human has to resolve this one.
    console.error(`[vtu] cannot requery ${reference}: no timestamp to rebuild request_id`);
    return tx.status;
  }

  let result: vtpass.RequeryResult;
  try {
    result = await vtpass.requery(reference, issuedAt);
  } catch {
    return tx.status; // still unknown; the sweep tries again
  }

  const status = statusForVtpassResponse(result.providerCode, result.providerStatus);
  if (status === "fulfilment_pending") return status;

  await transitionTransaction(admin, {
    reference,
    from: "fulfilment_pending",
    to: status,
    actor: "requery",
    patch: {
      token: result.token ?? null,
      units: result.units ?? null,
      ...(result.operatorReference
        ? { operator_transaction_id: result.operatorReference }
        : {}),
    },
    metadata: { providerCode: result.providerCode, providerStatus: result.providerStatus },
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
  if (action === "get_variations") {
    const settings = await loadSettings(admin);
    const serviceType = String(body.serviceType ?? "data");
    const provider = String(body.provider ?? "mtn");
    const surcharge = surchargeFor(serviceType, settings);
    const serviceId = requireServiceId(serviceType, provider);

    const cacheId = `vtpass:${serviceType}:${serviceId}`;

    try {
      const variations = await vtpass.listVariations(serviceId, surcharge);

      if (variations.length === 0) throw new Error("empty catalogue");
      await cacheCatalogue(admin, cacheId, `${serviceType}:${provider}`, variations);
      return json({ success: true, provider, surcharge, variations, plans: variations, stale: false });
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
    // VTPass has no providers-with-charges endpoint, so this is the list we
    // can actually deliver, with no service charge to declare. It is answered
    // from the service map rather than invented: a disco missing from that map
    // cannot be paid, so it must not be offered.
    const providers = Object.entries(vtpass.SERVICE_MAP)
      .filter(([, m]) => Boolean(m.power))
      .map(([code]) => ({
        code,
        name: code.toUpperCase(),
        // Zero, not unknown: VTPass levies no separate disco charge on top of
        // the vend amount. The biller's own floor comes from merchant-verify,
        // which the client calls before it can pay at all.
        serviceCharge: 0,
        serviceChargeType: "fixed",
        minAmount: 0,
      }));
    return json({ success: true, providers });
  }

  // ---- Verification (required before power and cable purchases) ---------
  if (action === "verify_meter" || action === "verify_cable") {
    await rateLimit(admin, `vtu:verify:${caller.id}`, 20, 60);
    const serviceType = action === "verify_meter" ? "power" : "cable";
    const serviceId = requireServiceId(serviceType, String(body.provider ?? ""));

    try {
      const verified = await vtpass.verifyMerchant({
        serviceId,
        billersCode: String(body.destination ?? ""),
        type: serviceType === "power"
          ? (body.meterType === "postpaid" ? "postpaid" : "prepaid")
          : undefined,
      });
      return json({
        success: true,
        customerName: verified.customerName,
        customerAddress: verified.customerAddress,
        minAmount: verified.minAmount,
        currentBouquet: verified.currentBouquet,
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        err instanceof Error
          ? err.message
          : `That ${serviceType === "power" ? "meter" : "smartcard"} could not be verified.`,
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
  // Only an explicit "purchase" (or no action at all) may reach the money
  // path. Anything else used to fall through to here, so a retired action
  // name — get_sme_plans, say, from an old build — would have been run as a
  // purchase attempt and failed on validation rather than being refused.
  if (action !== "purchase") {
    throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
  }

  const { mode, coherence } = readFulfilmentEnvironment(Deno.env);

  if (!coherence.ok) {
    console.error("[vtu] refusing to fulfil:", coherence.reason);
    throw new ApiError("Quick services are misconfigured and have been disabled.", 503, "FULFILMENT_MISCONFIGURED");
  }
  // `simulated` is deliberately NOT a path through here. It exists for
  // provider-free testing, and letting it fall through to the real purchase
  // flow with stubbed responses is exactly the thing that would hollow out
  // this rail: the MVP proof has to be Mono sandbox plus VTPass sandbox, not
  // our own idea of what they would have said.
  if (mode !== "live") {
    throw new ApiError(disabledMessage(mode), 503, "FULFILMENT_DISABLED");
  }
  if (!vtpass.isConfigured()) {
    throw new ApiError("Quick services are unavailable right now.", 503, "FULFILMENT_UNAVAILABLE");
  }
  if (!isMonoConfigured()) {
    // No payment rail means no way to take the money, and vending without
    // taking it is what this whole rework exists to stop.
    throw new ApiError("Payments are temporarily unavailable. Nothing was charged.", 503, "PAYMENT_UNAVAILABLE");
  }

  const input = parse(purchaseSchema, body);

  if ((input.serviceType === "power" || input.serviceType === "cable") && !input.customerName) {
    // Not a gateway requirement under VTPass, but still enforced: the customer
    // has to have seen whose meter or card they are crediting while the typo
    // was still free to fix. priceTransaction re-verifies server-side anyway,
    // because a client-side check is a courtesy rather than a control.
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

  // ---- Mono's own floor, checked before anything is written -------------
  // Mono will not debit under ₦200. Catching it here means the customer is
  // told before they authorise, rather than having a transaction opened, a
  // debit rejected and the whole thing unwound behind a spinner.
  if (priced.amount < MONO_MINIMUM_DEBIT_NGN) {
    throw new ApiError(
      `The smallest payment we can take from a bank account is ₦${MONO_MINIMUM_DEBIT_NGN}.`,
      400,
      "BELOW_PAYMENT_MINIMUM",
    );
  }

  // ---- OUR wallet, checked BEFORE the customer's bank ------------------
  // Leg 1 moves the customer's money to us; leg 2 spends our pre-funded
  // VTPass balance. Separate pots. An empty wallet means taking the money and
  // being unable to deliver.
  //
  // In sandbox this reads the sandbox wallet, which is the point: a sandbox
  // run that drains the test wallet must fail the same way production would.
  const wallet = await vtpass.walletBalance();
  if (wallet !== null && wallet < priced.baseAmount) {
    console.error(
      `[vtu] VTPASS WALLET TOO LOW: ${wallet} < ${priced.baseAmount} — refusing sale`,
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
  const destination = isTelecom ? vtpass.normalizeNigerianPhone(input.destination) : input.destination;
  const title = merchantTitle(input, priced.planLabel);
  const now = new Date().toISOString();

  const { data: created, error: insertError } = await admin
    .from("transactions")
    .insert({
      reference,
      user_id: caller.id,
      customer_id: profile.id,
      // Always the service label, never a person's name.
      //
      // This used to be `input.customerName ?? title`, because BigiSub's pay
      // endpoints needed the verified account holder read back at fulfilment
      // time. VTPass does not, so nothing consumes it any more — but the app
      // and the portals DISPLAY merchant_name as the merchant. The effect was
      // that an electricity purchase showed up in the customer's history as
      // "ADEKUNLE OLAITAN" instead of "IKEDC (prepaid)". The verified holder
      // is preserved on the opening transaction_event below, which is where a
      // fact about the purchase belongs rather than in a display field.
      merchant_name: title,
      amount: priced.amount,
      base_amount: priced.baseAmount,
      fee_amount: roundNaira(priced.amount - priced.baseAmount - priced.serviceCharge),
      service_charge: priced.serviceCharge,
      status: "initiated",
      service_type: input.serviceType,
      provider: input.provider,
      beneficiary: destination,
      variation_code: input.serviceType === "power" ? input.meterType : input.variationCode ?? null,
      fulfilment_provider: "vtpass",
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
    metadata: {
      serviceType: input.serviceType,
      provider: input.provider,
      title,
      // Who the biller said owns this meter or card, at the moment the
      // customer authorised it. Kept for the audit trail and for receipts.
      ...(input.customerName ? { verifiedAccountHolder: input.customerName } : {}),
      ...(input.customerAddress ? { verifiedAddress: input.customerAddress } : {}),
    },
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
      // Mono's initiate endpoint REQUIRES a customer object carrying either a
      // Mono customer id or name AND email. This passed name and phone only,
      // which their validator rejects — so every DirectPay purchase would have
      // failed at the first call. The profile's email is the one we hold.
      customer: {
        name: account.account_name || profile.fullName || "MiliPay customer",
        email: profile.email ?? null,
        phone: input.customerPhone ?? null,
      },
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
