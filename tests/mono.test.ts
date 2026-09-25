import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MonoError,
  initiateDebit,
  isMonoConfigured,
  refundPayment,
  toApiError,
} from "../supabase/functions/_shared/mono";

/**
 * Which Mono key moves money.
 *
 * Mono fixes an app's product when it is created, and its support confirmed a
 * Connect app cannot be given the Payments scope later. So MiliPay has two
 * apps: Connect (bank linking, MONO_SECRET_KEY) and Payments (DirectPay,
 * MONO_PAYMENTS_SECRET_KEY). Sending the Connect key to the payments API is
 * refused by Mono; these tests pin which key each call carries.
 *
 * fetch is stood in for, so this checks what WE send, not how Mono answers.
 */

const CONNECT_KEY = "test_sk_connect_fixture"; // secret-scan: allow — fake fixture, not a credential
const PAYMENTS_KEY = "test_sk_payments_fixture"; // secret-scan: allow — fake fixture, not a credential

const ENV: Record<string, string | undefined> = {};
const sent: { url: string; key: string | null; body: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of Object.keys(ENV)) delete ENV[k];
  sent.length = 0;
  (globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      key: (init?.headers as Record<string, string>)["mono-sec-key"] ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    // Shape from Mono's initiate example: the checkout link is mono_url.
    return new Response(
      JSON.stringify({
        status: "successful",
        data: { id: "ODW2QV0WLIDG", mono_url: "https://checkout.mono.co/ODW2QV0WLIDG", status: "pending" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).Deno;
});

const DEBIT = {
  reference: "MP-BIL-MFX2K9QZ-1A2B3C4D",
  amount: 200,
  description: "MTN Airtime",
  customer: { name: "Test Customer", email: "test@example.com" },
};

describe("payments use the PAYMENTS app's key", () => {
  it("starts a DirectPay payment with MONO_PAYMENTS_SECRET_KEY, not the Connect key", async () => {
    ENV.MONO_SECRET_KEY = CONNECT_KEY;
    ENV.MONO_PAYMENTS_SECRET_KEY = PAYMENTS_KEY;

    const result = await initiateDebit(DEBIT);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.withmono.com/v2/payments/initiate");
    expect(sent[0].key).toBe(PAYMENTS_KEY);
    expect(sent[0].key).not.toBe(CONNECT_KEY);
    // And the request itself: kobo, one-off, our reference.
    expect(sent[0].body).toMatchObject({ amount: 20000, type: "onetime-debit", reference: DEBIT.reference });
    expect(result.authorisationUrl).toBe("https://checkout.mono.co/ODW2QV0WLIDG");
    expect(result.monoPaymentId).toBe("ODW2QV0WLIDG");
  });

  it("refunds with the payments key too", async () => {
    ENV.MONO_SECRET_KEY = CONNECT_KEY;
    ENV.MONO_PAYMENTS_SECRET_KEY = PAYMENTS_KEY;

    await refundPayment({ monoPaymentId: "ODW2QV0WLIDG", reference: DEBIT.reference, amount: 200, reason: "test" });

    expect(sent[0].key).toBe(PAYMENTS_KEY);
  });

  it("falls back to MONO_SECRET_KEY when no separate payments key is set", async () => {
    ENV.MONO_SECRET_KEY = CONNECT_KEY;

    await initiateDebit(DEBIT);

    expect(sent[0].key).toBe(CONNECT_KEY);
  });

  it("counts as configured with either key, and not with neither", () => {
    expect(isMonoConfigured()).toBe(false);
    ENV.MONO_PAYMENTS_SECRET_KEY = PAYMENTS_KEY;
    expect(isMonoConfigured()).toBe(true);
    delete ENV.MONO_PAYMENTS_SECRET_KEY;
    ENV.MONO_SECRET_KEY = CONNECT_KEY;
    expect(isMonoConfigured()).toBe(true);
  });

  it("refuses to call Mono at all with no key", async () => {
    await expect(initiateDebit(DEBIT)).rejects.toThrow("not configured");
    expect(sent).toHaveLength(0);
  });
});

describe("what the customer is told when Mono refuses to start a payment", () => {
  const FALLBACK = "This payment couldn't be started. Nothing was charged — please try again later.";

  it("a refusal — like 'no access to DirectPay' — is 'not started', never 'your bank declined'", () => {
    // The first sandbox purchase: Mono said the business had no DirectPay
    // access, and the customer was told their bank had declined it.
    const err = toApiError(
      new MonoError("Your business does not have access to DirectPay", false, "403"),
      FALLBACK,
    );
    expect(err.message).toBe(FALLBACK);
    expect(err.code).toBe("PAYMENT_NOT_STARTED");
    expect(err.status).toBe(502);
    expect(err.message).not.toMatch(/bank (declined|rejected)/i);
  });

  it("a timeout or outage is 'briefly unavailable', and does not blame the bank either", () => {
    const err = toApiError(new MonoError("Mono timed out", true), FALLBACK);
    expect(err.code).toBe("PAYMENT_UNAVAILABLE");
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/nothing was charged/i);
    expect(err.message).not.toMatch(/your bank/i);
  });

  it("an unexpected error gets the same honest fallback", () => {
    const err = toApiError(new Error("boom"), FALLBACK);
    expect(err.message).toBe(FALLBACK);
    expect(err.code).toBe("PAYMENT_NOT_STARTED");
  });
});
