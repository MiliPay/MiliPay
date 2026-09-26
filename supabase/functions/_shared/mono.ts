import { ApiError } from "./auth.ts";
import { monoPaymentsSecret } from "./environment.ts";
import { monoAppTag } from "./mono-app-tag.ts";
import { koboToNaira, nairaToKobo } from "./money.ts";

/**
 * Mono — the rail that moves the customer's money.
 *
 * This is the only module that talks to Mono. Everything else deals in Naira
 * and MiliPay references; the kobo conversion, the endpoint shapes and the
 * credential all stop here.
 *
 * Two ways to debit:
 *
 *   directpay  one-off. The customer authorises this specific payment on
 *              Mono's page. Always the fallback, but it means a trip to the
 *              bank for every purchase.
 *   mandate    "quick pay". The customer authorises once (see quick-pay.ts)
 *              and later purchases debit against that standing mandate —
 *              fingerprint and done, still real money per transaction, no
 *              float held.
 *
 * Which one a purchase uses is decided per purchase by vtu-service, from the
 * account's mandate: initiateDebit debits a mandate when it is handed one and
 * starts a DirectPay payment when it is not. MONO_PAYMENT_MODE only says
 * whether quick pay is allowed at all — `mandate` allows it, anything else
 * (the default) keeps every purchase on DirectPay. It stays off by default
 * because Direct Debit is a product Mono has to enable on the account.
 *
 * ENDPOINT PATHS AND BODIES were checked against Mono's published reference
 * in September 2026: /v2/payments/initiate for DirectPay and for starting a
 * mandate (type recurring-debit), /v2/customers, /v3/payments/mandates/{id}/
 * debit and /cancel. Amounts are kobo throughout, which is why nairaToKobo is
 * applied here and nowhere else. They stay isolated in this module so
 * correcting one is a one-line change rather than a hunt.
 *
 * SANDBOX. Mono has no separate sandbox host — test and live are the same
 * host, told apart by the key prefix (test_… / live_…), which is why
 * environment.ts classifies Mono from the payments key rather than the URL.
 *
 * TWO APPS. Mono fixes each app's product at creation: bank linking is a
 * Connect app, DirectPay needs a Payments app, and one cannot be converted
 * into the other. Everything in this module is payments, so it uses the
 * Payments app's key (MONO_PAYMENTS_SECRET_KEY). The Connect app's key stays
 * in MONO_SECRET_KEY for link-mono-account and identity lookup. The Payments
 * app is also where the webhook must be registered: Mono sends payment events
 * from the app whose key started the payment.
 * Things that behave differently on test keys, and that the flow has to
 * tolerate rather than be surprised by:
 *
 *   - the account balance is fixed at ₦10,000, and sufficiency is checked
 *     against it
 *   - the minimum debit is ₦200, enforced in vtu-service before a transaction
 *     is ever opened
 *   - a mandate created through the API is auto-approved, but its
 *     events.mandates.ready webhook does not arrive for an hour
 */

const ENDPOINTS = {
  initiatePayment: "/v2/payments/initiate",
  verifyPayment: "/v2/payments/verify",
  debitMandate: "/v3/payments/mandates/:id/debit",
  cancelMandate: "/v3/payments/mandates/:id/cancel",
  createCustomer: "/v2/customers",
  refund: "/v2/payments/refund",
} as const;

export class MonoError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "MonoError";
  }
}

export type MonoPaymentMode = "directpay" | "mandate";

/**
 * `mandate` allows quick pay; anything else keeps every purchase on DirectPay.
 * Even under `mandate`, an account without an active mandate pays by
 * DirectPay — see choosePaymentRoute in quick-pay.ts.
 */
export function monoPaymentMode(): MonoPaymentMode {
  return String(Deno.env.get("MONO_PAYMENT_MODE") ?? "").trim().toLowerCase() === "mandate"
    ? "mandate"
    : "directpay";
}

function baseUrl(): string {
  return (Deno.env.get("MONO_BASE_URL") || "https://api.withmono.com").replace(/\/+$/, "");
}

/**
 * The PAYMENTS app's key. Mono fixes an app's product scope at creation, so
 * payments cannot share the Connect app that bank linking uses — see
 * monoPaymentsSecret() in environment.ts, which falls back to MONO_SECRET_KEY
 * when no separate payments key is set.
 */
function secretKey(): string {
  return monoPaymentsSecret(Deno.env).key;
}

export function isMonoConfigured(): boolean {
  return secretKey().trim().length > 0;
}

/** Which Mono app takes payments — see mono-app-tag.ts. */
export function paymentsAppTag(): Promise<string | null> {
  return monoAppTag(secretKey());
}

/**
 * Where Mono sends the customer when they finish on its page.
 *
 * The app's own scheme by default, so a built app reopens itself. Mono's docs
 * only ever show https examples; if Mono refuses a custom scheme, setting
 * MONO_REDIRECT_URL to an https page fixes it without a code change.
 */
export function monoRedirectUrl(): string {
  const configured = (Deno.env.get("MONO_REDIRECT_URL") ?? "").trim();
  return configured || "milipay://payment-complete";
}

export interface CallOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown>;
  timeoutMs?: number;
  /**
   * Defaults to the payments key. Only mono-connect.ts passes another — the
   * Connect app's, to read an account linked through it. This module itself
   * never reads MONO_SECRET_KEY.
   */
  key?: string;
}

/**
 * Every Mono call goes through here so that timeouts, credential handling and
 * error shaping are consistent.
 *
 * A timeout is reported as RETRYABLE and must never be interpreted by the
 * caller as "the payment failed" — Mono may have taken the money and we simply
 * did not hear the answer. The caller's job is to leave the transaction
 * unsettled and let reconciliation find out, not to guess.
 */
export async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const key = opts.key ?? secretKey();
  if (!key) {
    throw new MonoError("Mono is not configured", false, "NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: opts.method ?? "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "mono-sec-key": key,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new MonoError("Mono returned a response we could not read", true);
    }

    if (!res.ok) {
      // 5xx and 429 are worth retrying; a 4xx means the request itself is
      // wrong and retrying it will fail identically.
      const retryable = res.status >= 500 || res.status === 429;
      const message = typeof payload.message === "string" ? payload.message : `Mono responded ${res.status}`;
      throw new MonoError(message, retryable, String(res.status));
    }

    return payload as T;
  } catch (err) {
    if (err instanceof MonoError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new MonoError("Mono timed out", true, "TIMEOUT");
    }
    throw new MonoError("Could not reach Mono", true, "UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// Debit
// ─────────────────────────────────────────────────────────────

export interface DebitRequest {
  /** MiliPay's reference. Mono echoes it back on the webhook. */
  reference: string;
  /** Naira. Converted to kobo exactly once, here. */
  amount: number;
  description: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  /**
   * Quick pay: debit this mandate, with no customer interaction. Absent means
   * a DirectPay payment the customer approves on Mono's page.
   */
  mandateId?: string | null;
  /**
   * DirectPay only: the linked account's Mono id, so Mono's page skips the
   * bank picker and the bank login and asks only for the approval. Mono
   * accepts only an account linked through the SAME app — the caller checks
   * that (see mono-app-tag.ts) and passes null when it cannot be sure.
   * https://docs.mono.co/docs/payments/onetime/integration-guide
   */
  accountId?: string | null;
}

export interface DebitResult {
  monoPaymentId: string;
  /** Present for DirectPay: the customer must visit this to authorise. */
  authorisationUrl: string | null;
  /** What Mono said right now. The webhook is what we actually act on. */
  providerStatus: string | null;
}

/**
 * Debits the customer: under a mandate when given one, DirectPay otherwise.
 *
 * THE TWO FAIL DIFFERENTLY, and the caller must treat them differently.
 * Starting a DirectPay payment moves nothing — the customer has not approved
 * it yet — so any error means nothing was charged. A MANDATE debit moves
 * money the moment Mono accepts it, so a timeout or a 5xx does NOT mean
 * nothing was charged: Mono may have debited and we missed the answer. Only a
 * definite refusal (a non-retryable 4xx) proves the money did not move.
 */
export async function initiateDebit(request: DebitRequest): Promise<DebitResult> {
  const amountKobo = nairaToKobo(request.amount);

  if (request.mandateId) {
    const payload = await call<{ data?: Record<string, unknown> }>(
      ENDPOINTS.debitMandate.replace(":id", encodeURIComponent(request.mandateId)),
      {
        body: {
          amount: amountKobo,
          reference: request.reference,
          narration: request.description,
        },
      },
    );
    const data = payload.data ?? {};
    // Mono's debit response names its own reference `reference_number`, and
    // the debit webhooks carry the same field — so it is kept, and the
    // webhook can find this transaction by it if our reference is not echoed.
    // https://docs.mono.co/docs/payments/direct-debit/debit-an-account
    return {
      monoPaymentId: String(data.reference_number ?? data.id ?? data.reference ?? request.reference),
      authorisationUrl: null,
      providerStatus: typeof data.status === "string" ? data.status : null,
    };
  }

  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.initiatePayment, {
    body: {
      amount: amountKobo,
      type: "onetime-debit",
      description: request.description,
      reference: request.reference,
      redirect_url: monoRedirectUrl(),
      ...(request.accountId ? { account: request.accountId } : {}),
      customer: {
        name: request.customer.name,
        email: request.customer.email ?? undefined,
        phone: request.customer.phone ?? undefined,
      },
    },
  });

  const data = payload.data ?? {};
  const id = data.id ?? data.reference;
  if (!id) {
    throw new MonoError("Mono did not return a payment id", false, "NO_PAYMENT_ID");
  }

  return {
    monoPaymentId: String(id),
    authorisationUrl: typeof data.mono_url === "string" ? data.mono_url : null,
    providerStatus: typeof data.status === "string" ? data.status : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Verify — the belt to the webhook's braces
// ─────────────────────────────────────────────────────────────

export interface PaymentStatus {
  status: string;
  /** Naira. */
  amount: number | null;
  reference: string | null;
}

/**
 * Asked by reconciliation when a webhook never arrived. Webhooks get lost;
 * a transaction sitting in `initiated` for an hour is not evidence that the
 * customer was not charged.
 */
export async function getPaymentStatus(reference: string): Promise<PaymentStatus> {
  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.verifyPayment, {
    body: { reference },
  });
  const data = payload.data ?? {};
  let amount: number | null = null;
  try {
    amount = data.amount === undefined || data.amount === null
      ? null
      : koboToNaira(data.amount as number);
  } catch {
    amount = null;
  }
  return {
    status: String(data.status ?? "unknown"),
    amount,
    reference: typeof data.reference === "string" ? data.reference : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Refund
// ─────────────────────────────────────────────────────────────

export interface RefundRequest {
  monoPaymentId: string;
  reference: string;
  /** Naira. */
  amount: number;
  reason: string;
}

export async function refundPayment(request: RefundRequest): Promise<{ ok: boolean; providerRef: string | null }> {
  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.refund, {
    body: {
      reference: request.reference,
      payment_id: request.monoPaymentId,
      amount: nairaToKobo(request.amount),
      reason: request.reason,
    },
  });
  const data = payload.data ?? {};
  return {
    ok: true,
    providerRef: typeof data.id === "string" ? data.id : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Mandates
// ─────────────────────────────────────────────────────────────

/**
 * A Mono customer — the person a mandate is signed by.
 *
 * All six fields are required by Mono, and the BVN must be the account
 * holder's. The BVN goes to Mono and nowhere else: it is never logged, and
 * only the id Mono returns is kept.
 * https://docs.mono.co/docs/payments/direct-debit/integration-guide-create-customers
 */
export interface MonoCustomerRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  bvn: string;
}

export async function createMonoCustomer(request: MonoCustomerRequest): Promise<string> {
  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.createCustomer, {
    body: {
      identity: { type: "bvn", number: request.bvn },
      email: request.email,
      first_name: request.firstName,
      last_name: request.lastName,
      address: request.address,
      phone: request.phone,
    },
  });
  const id = payload.data?.id;
  if (typeof id !== "string" || !id) {
    throw new MonoError("Mono did not return a customer id", false, "NO_CUSTOMER_ID");
  }
  return id;
}

export interface MandateRequest {
  /** MiliPay's reference for this setup. Mono echoes it on the mandate's events. */
  reference: string;
  /** Mono's customer id, from createMonoCustomer. */
  monoCustomerId: string;
  /** Naira. The TOTAL MiliPay may take over the mandate's life. */
  allowance: number;
  accountNumber: string;
  bankCode: string;
  description: string;
  /** YYYY-MM-DD, from mandateWindow(). */
  startDate: string;
  endDate: string;
}

export interface MandateResult {
  /** Mono's mandate id (mmc_…) when it returns one at initiation. */
  mandateId: string | null;
  /** Mono's page, where the customer approves and is shown where to send ₦50. */
  authorisationUrl: string;
}

/**
 * Starts a quick-pay mandate: a variable e-mandate, so each purchase can be a
 * different amount up to the total.
 *
 * This moves no money. It returns Mono's page, which walks the customer
 * through the ₦50 authorisation transfer; the mandate becomes usable only
 * when events.mandates.ready arrives.
 * https://docs.mono.co/api/direct-debit/mandate/initiate-mandate-authorisation
 */
export async function initiateMandate(request: MandateRequest): Promise<MandateResult> {
  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.initiatePayment, {
    body: {
      amount: nairaToKobo(request.allowance),
      type: "recurring-debit",
      method: "mandate",
      mandate_type: "emandate",
      debit_type: "variable",
      account_number: request.accountNumber,
      bank_code: request.bankCode,
      description: request.description,
      reference: request.reference,
      redirect_url: monoRedirectUrl(),
      customer: { id: request.monoCustomerId },
      start_date: request.startDate,
      end_date: request.endDate,
    },
  });

  const data = payload.data ?? {};
  const url = data.mono_url;
  if (typeof url !== "string" || !url) {
    throw new MonoError("Mono did not return an authorisation link", false, "NO_MANDATE_URL");
  }
  const id = data.mandate_id ?? data.id;
  return { mandateId: typeof id === "string" && id ? id : null, authorisationUrl: url };
}

/**
 * Cancels a mandate at Mono, so the customer's bank stops honouring it.
 * https://docs.mono.co/api/direct-debit/mandate/cancel-mandate
 */
export async function cancelMandate(mandateId: string): Promise<void> {
  await call(ENDPOINTS.cancelMandate.replace(":id", encodeURIComponent(mandateId)), {
    method: "PATCH",
  });
}

/** Maps a MonoError onto the customer-facing shape without leaking provider detail. */
/**
 * What the customer is told when Mono refuses to START a payment.
 *
 * Never "your bank declined". At this point no bank has seen anything: a
 * refusal here is Mono or our own configuration — the first sandbox purchase
 * met "Your business does not have access to DirectPay" and the customer was
 * told their bank had declined it. Mono's real reason is kept on the
 * transaction's failure_reason, where staff can read it; the customer gets
 * the truth, which is that the payment did not start and nothing was taken.
 */
export function toApiError(err: unknown, fallback: string): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof MonoError) {
    return new ApiError(
      err.retryable
        ? "Payments are briefly unavailable. Nothing was charged — please try again shortly."
        : fallback,
      err.retryable ? 503 : 502,
      err.retryable ? "PAYMENT_UNAVAILABLE" : "PAYMENT_NOT_STARTED",
    );
  }
  return new ApiError(fallback, 502, "PAYMENT_NOT_STARTED");
}
