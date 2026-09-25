import { ApiError } from "./auth.ts";
import { monoPaymentsSecret } from "./environment.ts";
import { koboToNaira, nairaToKobo } from "./money.ts";

/**
 * Mono — the rail that moves the customer's money.
 *
 * This is the only module that talks to Mono. Everything else deals in Naira
 * and MiliPay references; the kobo conversion, the endpoint shapes and the
 * credential all stop here.
 *
 * Two ways to debit, chosen by MONO_PAYMENT_MODE:
 *
 *   directpay  one-off. The customer authorises this specific payment in
 *              Mono's widget. Always available, but it means a bank login for
 *              every purchase.
 *   mandate    the customer authorises once, when they link the account, and
 *              subsequent purchases debit against that standing mandate. This
 *              is what makes "fingerprint and it's done" possible while still
 *              moving real money per transaction and holding no float.
 *
 * Mandate is the intended mode. It is not the default, because whether it is
 * enabled on the MiliPay Mono account is unconfirmed — see
 * docs/palm-scanner-integration.md's sibling note in the plan. Defaulting to
 * the mode we know exists is the safe way round.
 *
 * ENDPOINT PATHS were checked against Mono's published API reference in
 * September 2026 and match: /v2/payments/initiate for DirectPay,
 * /v3/payments/mandates and /v3/payments/mandates/{id}/debit for Direct Debit.
 * Amounts are kobo on both, which is why nairaToKobo is applied here and
 * nowhere else. They remain isolated in this module so correcting one is a
 * one-line change rather than a hunt.
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
  createMandate: "/v3/payments/mandates",
  debitMandate: "/v3/payments/mandates/:id/debit",
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

interface CallOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs?: number;
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
async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const key = secretKey();
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
  /** Mandate mode only. */
  mandateId?: string | null;
  /** DirectPay mode only: where Mono sends the customer afterwards. */
  redirectUrl?: string | null;
}

export interface DebitResult {
  monoPaymentId: string;
  /** Present in directpay mode: the customer must visit this to authorise. */
  authorisationUrl: string | null;
  /** What Mono said right now. The webhook is what we actually act on. */
  providerStatus: string | null;
}

export async function initiateDebit(request: DebitRequest): Promise<DebitResult> {
  const amountKobo = nairaToKobo(request.amount);
  const mode = monoPaymentMode();

  if (mode === "mandate") {
    if (!request.mandateId) {
      throw new MonoError("No active mandate for this account", false, "NO_MANDATE");
    }
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
    return {
      monoPaymentId: String(data.id ?? data.reference ?? request.reference),
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
      redirect_url: request.redirectUrl ?? undefined,
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

export interface MandateRequest {
  reference: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  /** Naira ceiling per debit, as approved by the bank. */
  maxPerDebit: number;
  description: string;
  startDate?: string;
  endDate?: string;
}

export interface MandateResult {
  mandateId: string;
  status: string;
  authorisationUrl: string | null;
}

export async function createMandate(request: MandateRequest): Promise<MandateResult> {
  const payload = await call<{ data?: Record<string, unknown> }>(ENDPOINTS.createMandate, {
    body: {
      type: "recurring-debit",
      reference: request.reference,
      amount: nairaToKobo(request.maxPerDebit),
      description: request.description,
      start_date: request.startDate,
      end_date: request.endDate,
      customer: {
        name: request.customer.name,
        email: request.customer.email ?? undefined,
        phone: request.customer.phone ?? undefined,
      },
    },
  });

  const data = payload.data ?? {};
  const id = data.id ?? data.mandate_id;
  if (!id) throw new MonoError("Mono did not return a mandate id", false, "NO_MANDATE_ID");

  return {
    mandateId: String(id),
    status: String(data.status ?? "pending"),
    authorisationUrl: typeof data.mono_url === "string" ? data.mono_url : null,
  };
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
