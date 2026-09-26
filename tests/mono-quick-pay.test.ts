import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MonoError,
  cancelMandate,
  createMonoCustomer,
  initiateDebit,
  initiateMandate,
} from "../supabase/functions/_shared/mono";
import { linkedAccountBankCode } from "../supabase/functions/_shared/mono-connect";

/**
 * What MiliPay SENDS Mono for quick pay, checked against Mono's documented
 * requests field by field. fetch is stood in for, so this proves our side of
 * the conversation; the first real sandbox run proves Mono's.
 *
 *   initiate mandate  https://docs.mono.co/api/direct-debit/mandate/initiate-mandate-authorisation
 *   create customer   https://docs.mono.co/docs/payments/direct-debit/integration-guide-create-customers
 *   debit a mandate   https://docs.mono.co/docs/payments/direct-debit/debit-an-account
 *   cancel a mandate  https://docs.mono.co/api/direct-debit/mandate/cancel-mandate
 *   preselect account https://docs.mono.co/docs/payments/onetime/integration-guide
 */

const CONNECT_KEY = "test_sk_connect_fixture"; // secret-scan: allow — fake fixture, not a credential
const PAYMENTS_KEY = "test_sk_payments_fixture"; // secret-scan: allow — fake fixture, not a credential

const ENV: Record<string, string | undefined> = {};
let sent: { url: string; method: string; key: string | null; body: Record<string, unknown> }[];
let answer: (url: string) => { status?: number; body: unknown };
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of Object.keys(ENV)) delete ENV[k];
  ENV.MONO_SECRET_KEY = CONNECT_KEY;
  ENV.MONO_PAYMENTS_SECRET_KEY = PAYMENTS_KEY;
  sent = [];
  answer = () => ({ body: { status: "successful", data: {} } });
  (globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({
      url,
      method: init?.method ?? "GET",
      key: (init?.headers as Record<string, string>)["mono-sec-key"] ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    const { status = 200, body } = answer(url);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).Deno;
});

describe("starting a quick-pay mandate", () => {
  const REQUEST = {
    reference: "MP-QP-TEST-1234ABCD",
    monoCustomerId: "65eb623b0000900009e5c1f21cd",
    allowance: 50_000,
    accountNumber: "0123456789",
    bankCode: "058",
    description: "MiliPay quick pay",
    startDate: "2026-09-26",
    endDate: "2027-09-26",
  };

  it("sends Mono's documented variable e-mandate request, in kobo, with the payments key", async () => {
    // Mono's documented response for this request.
    answer = () => ({
      body: {
        status: "successful",
        message: "Payment Initiated Successfully",
        data: {
          mandate_id: "mmc_682b977203c0b7360787b46g",
          type: "recurring-debit",
          method: "mandate",
          amount: 5_000_000,
          mandate_type: "emandate",
          mono_url: "https://authorise.mono.co/RD3044259",
          reference: REQUEST.reference,
          customer: REQUEST.monoCustomerId,
        },
      },
    });

    const result = await initiateMandate(REQUEST);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.withmono.com/v2/payments/initiate");
    expect(sent[0].key).toBe(PAYMENTS_KEY);
    expect(sent[0].body).toEqual({
      amount: 5_000_000, // ₦50,000 — the TOTAL over the mandate's life
      type: "recurring-debit",
      method: "mandate",
      mandate_type: "emandate",
      debit_type: "variable",
      account_number: "0123456789",
      bank_code: "058",
      description: "MiliPay quick pay",
      reference: REQUEST.reference,
      redirect_url: "milipay://payment-complete",
      customer: { id: REQUEST.monoCustomerId },
      start_date: "2026-09-26",
      end_date: "2027-09-26",
    });
    expect(result).toEqual({
      mandateId: "mmc_682b977203c0b7360787b46g",
      authorisationUrl: "https://authorise.mono.co/RD3044259",
    });
  });

  it("uses MONO_REDIRECT_URL when set", async () => {
    ENV.MONO_REDIRECT_URL = "https://milipay.example/return";
    answer = () => ({ body: { data: { mono_url: "https://authorise.mono.co/x" } } });
    await initiateMandate(REQUEST);
    expect(sent[0].body.redirect_url).toBe("https://milipay.example/return");
  });

  it("refuses to carry on without Mono's page — there would be nothing for the customer to approve", async () => {
    answer = () => ({ body: { data: { mandate_id: "mmc_x" } } });
    await expect(initiateMandate(REQUEST)).rejects.toThrow(MonoError);
  });
});

describe("the Mono customer a mandate is signed by", () => {
  it("sends Mono's six required fields, BVN as the identity, with the payments key", async () => {
    answer = () => ({ body: { status: "successful", data: { id: "6578295bbf09b0a505123456" } } });

    const id = await createMonoCustomer({
      firstName: "Samuel",
      lastName: "Olamide",
      email: "samuel@example.com",
      phone: "08012345678",
      address: "Agungi, Lagos",
      bvn: "22222222222", // secret-scan: allow — fake fixture, not a credential
    });

    expect(id).toBe("6578295bbf09b0a505123456");
    expect(sent[0].url).toBe("https://api.withmono.com/v2/customers");
    expect(sent[0].key).toBe(PAYMENTS_KEY);
    expect(sent[0].body).toEqual({
      identity: { type: "bvn", number: "22222222222" }, // secret-scan: allow — fake fixture, not a credential
      email: "samuel@example.com",
      first_name: "Samuel",
      last_name: "Olamide",
      address: "Agungi, Lagos",
      phone: "08012345678",
    });
  });
});

describe("debiting and cancelling", () => {
  it("debits a mandate with no customer step, and keeps Mono's reference_number", async () => {
    // Mono's documented debit response.
    answer = () => ({
      body: {
        status: "successful",
        message: "Account debited successfully.",
        data: { amount: 20000, mandate: "mmc_6836182ac511bb531611daf9", reference_number: "refbtD03191D118", fee: 5500 },
      },
    });

    const result = await initiateDebit({
      reference: "MP-BIL-QP-1",
      amount: 200,
      description: "MTN Airtime",
      customer: { name: "Samuel Olamide" },
      mandateId: "mmc_6836182ac511bb531611daf9",
    });

    expect(sent[0].url).toBe("https://api.withmono.com/v3/payments/mandates/mmc_6836182ac511bb531611daf9/debit");
    expect(sent[0].key).toBe(PAYMENTS_KEY);
    expect(sent[0].body).toEqual({ amount: 20000, reference: "MP-BIL-QP-1", narration: "MTN Airtime" });
    expect(result.authorisationUrl).toBeNull();
    expect(result.monoPaymentId).toBe("refbtD03191D118");
  });

  it("cancels with a PATCH to the mandate's cancel endpoint", async () => {
    await cancelMandate("mmc_6579495142cc7e8894f6e031");
    expect(sent[0]).toMatchObject({
      url: "https://api.withmono.com/v3/payments/mandates/mmc_6579495142cc7e8894f6e031/cancel",
      method: "PATCH",
      key: PAYMENTS_KEY,
    });
  });
});

describe("DirectPay's bank-picker shortcut", () => {
  const DEBIT = {
    reference: "MP-BIL-DP-1",
    amount: 200,
    description: "MTN Airtime",
    customer: { name: "Samuel Olamide", email: "samuel@example.com" },
  };

  it("hands Mono the linked account when the caller vouches for it", async () => {
    answer = () => ({ body: { data: { id: "txd_1", mono_url: "https://checkout.mono.co/txd_1" } } });
    await initiateDebit({ ...DEBIT, accountId: "678f7bc977eb9afb06fff11f" });
    expect(sent[0].body.account).toBe("678f7bc977eb9afb06fff11f");
    expect(sent[0].body.redirect_url).toBe("milipay://payment-complete");
  });

  it("sends no account at all otherwise — the customer picks their bank, as before", async () => {
    answer = () => ({ body: { data: { id: "txd_1", mono_url: "https://checkout.mono.co/txd_1" } } });
    await initiateDebit({ ...DEBIT, accountId: null });
    expect(sent[0].body).not.toHaveProperty("account");
  });
});

describe("reading a linked account's bank code", () => {
  it("uses the CONNECT key — the account was linked through that app", async () => {
    answer = () => ({
      body: { data: { account: { institution: { name: "GTBank", bank_code: "058", type: "PERSONAL_BANKING" } } } },
    });
    expect(await linkedAccountBankCode("acc_123")).toBe("058");
    expect(sent[0]).toMatchObject({
      url: "https://api.withmono.com/v2/accounts/acc_123",
      method: "GET",
      key: CONNECT_KEY,
    });
  });

  it("reads Mono's other spelling, and answers null rather than guessing", async () => {
    answer = () => ({ body: { data: { account: { institution: { bankCode: "011" } } } } });
    expect(await linkedAccountBankCode("acc_1")).toBe("011");
    answer = () => ({ body: { data: { account: { institution: { name: "GTBank" } } } } });
    expect(await linkedAccountBankCode("acc_1")).toBeNull();
  });
});
