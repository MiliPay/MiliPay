import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { monoAppTag } from "../supabase/functions/_shared/mono-app-tag";

/**
 * vtu-service's PURCHASE path, run for real, for the one question quick pay
 * adds: which way is the customer's money taken — and what happens when the
 * answer does not come back.
 *
 * The Edge Function is imported and called with real Requests; the database
 * is in memory; VTPass (wallet balance only — a purchase does not vend) and
 * Mono are stood in for at fetch. Everything between — pricing, limits, the
 * transaction row, the route, the debit — is the real code.
 */

const CONNECT_KEY = "test_sk_connect_fixture"; // secret-scan: allow — fake fixture, not a credential
const PAYMENTS_KEY = "test_sk_payments_fixture"; // secret-scan: allow — fake fixture, not a credential
const ACCT = "11111111-1111-4111-8111-111111111111";
const MANDATE = "mmc_6836182ac511bb531611daf9";

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  VTU_FULFILMENT_MODE: "live",
  MILIPAY_ENVIRONMENT: "sandbox",
  VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
  VTPASS_API_KEY: "api-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_SECRET_KEY: "sk-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_PUBLIC_KEY: "pk-fixture", // secret-scan: allow — fake fixture, not a credential
  MONO_SECRET_KEY: CONNECT_KEY,
  MONO_PAYMENTS_SECRET_KEY: PAYMENTS_KEY,
};
const ENV: Record<string, string | undefined> = {};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let monoCalls: { path: string; body: Record<string, unknown> }[];
let monoAnswer: (path: string) => Response | Promise<Response>;
const realFetch = globalThis.fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/vtu-service/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("vtu-service did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);

  db = new FakeSupabase({
    customers: [
      {
        id: "cust-1", auth_user_id: "user-1", status: "active", first_name: "Samuel", last_name: "Olamide",
        email: "samuel@example.com", kyc_tier: 2, pin_threshold: 10_000, single_limit: null, daily_limit: null,
      },
    ],
    linked_accounts: [
      {
        id: ACCT, user_id: "user-1", is_active: true, account_name: "SAMUEL OLAMIDE",
        mono_account_id: "678f7bc977eb9afb06fff11f", mono_app_tag: null,
      },
    ],
    mono_mandates: [],
    transactions: [],
    transaction_events: [],
    push_tokens: [],
  });
  db.users.set("tok-1", { id: "user-1", email: "samuel@example.com" });
  db.rpcAnswers.set("consume_rate_limit", () => true);
  db.rpcAnswers.set("get_customer_daily_spend", () => 0);
  (globalThis as any).__fakeSupabase = db;

  monoCalls = [];
  monoAnswer = (path) =>
    path.endsWith("/debit")
      ? json({ status: "successful", data: { amount: 50000, mandate: MANDATE, reference_number: "ref_from_mono" } })
      : json({ status: "successful", data: { id: "txd_1", mono_url: "https://checkout.mono.co/txd_1" } });

  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host === "sandbox.vtpass.com") return json({ code: "1", contents: { balance: 1_000_000 } });
    if (url.host === "api.withmono.com") {
      monoCalls.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return monoAnswer(url.pathname);
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function buyAirtime(amount = 500) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/vtu-service", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok-1" },
      body: JSON.stringify({
        action: "purchase", serviceType: "airtime", provider: "mtn",
        destination: "08031234567", accountId: ACCT, amount,
      }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const onlyTx = () => {
  expect(db.table("transactions")).toHaveLength(1);
  return db.table("transactions")[0];
};

function activeMandate(overrides: Record<string, unknown> = {}) {
  db.table("mono_mandates").push({
    id: "m-1", user_id: "user-1", linked_account_id: ACCT, status: "active",
    mono_mandate_id: MANDATE, max_total: 50_000, max_per_debit: null, expires_at: null, ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────

describe("quick pay switched OFF for the business (the default)", () => {
  it("every purchase is DirectPay — even on an account with an active mandate", async () => {
    activeMandate();
    const { status, body } = await buyAirtime();

    expect(status).toBe(200);
    expect(body.paymentRoute).toBe("directpay");
    expect(body.authorisationUrl).toBe("https://checkout.mono.co/txd_1");
    expect(monoCalls.map((c) => c.path)).toEqual(["/v2/payments/initiate"]);
    expect(onlyTx().mono_mandate_id).toBeUndefined();
  });
});

describe("quick pay switched ON", () => {
  beforeEach(() => {
    ENV.MONO_PAYMENT_MODE = "mandate";
  });

  it("an account with an active mandate is debited directly — no page, nothing for the customer to do", async () => {
    activeMandate();
    const { status, body } = await buyAirtime(500);

    expect(status).toBe(200);
    expect(body.paymentRoute).toBe("mandate");
    expect(body.status).toBe("initiated");
    expect(body.authorisationUrl).toBeNull();
    expect(monoCalls).toEqual([
      { path: `/v3/payments/mandates/${MANDATE}/debit`, body: expect.objectContaining({ amount: 50000 }) },
    ]);

    const tx = onlyTx();
    expect(tx.status).toBe("initiated"); // the webhook, not this response, says paid
    expect(tx.mono_mandate_id).toBe(MANDATE);
    expect(tx.mono_payment_id).toBe("ref_from_mono");
  });

  it("an account without one pays by DirectPay", async () => {
    const { body } = await buyAirtime();
    expect(body.paymentRoute).toBe("directpay");
    expect(monoCalls.map((c) => c.path)).toEqual(["/v2/payments/initiate"]);
  });

  it("a mandate whose allowance is used up falls back to DirectPay rather than refusing", async () => {
    activeMandate({ max_total: 20_000 });
    db.table("transactions").push({ reference: "earlier", mono_mandate_id: MANDATE, status: "delivered", amount: 19_800 });

    const { status, body } = await buyAirtime(500);

    expect(status).toBe(200);
    expect(body.paymentRoute).toBe("directpay");
  });

  it("a quick-pay debit whose answer never came back is NOT failed — the customer may have been charged", async () => {
    activeMandate();
    monoAnswer = () => {
      throw new TypeError("connection reset");
    };

    const { status, body } = await buyAirtime();

    expect(status).toBe(200);
    expect(body.status).toBe("initiated");
    expect(body.message).toMatch(/confirming/i);
    expect(body.message).not.toMatch(/nothing was charged/i);
    const tx = onlyTx();
    expect(tx.status).toBe("initiated");
    expect(tx.mono_mandate_id).toBe(MANDATE);
  });

  it("the same for a 5xx: Mono may have debited before it failed", async () => {
    activeMandate();
    monoAnswer = () => json({ message: "internal error" }, 502);

    const { body } = await buyAirtime();

    expect(body.status).toBe("initiated");
    expect(onlyTx().status).toBe("initiated");
  });

  it("but a definite refusal IS a failure, and nothing was charged", async () => {
    activeMandate();
    monoAnswer = () => json({ message: "Insufficient funds" }, 400);

    const { status, body } = await buyAirtime();

    expect(status).toBe(502);
    expect(body.error).toMatch(/nothing was charged/i);
    expect(onlyTx().status).toBe("payment_failed");
  });
});

describe("DirectPay is unchanged where it matters", () => {
  it("a timeout STARTING a DirectPay payment is still a failure — nothing moves until the customer approves", async () => {
    monoAnswer = () => {
      throw new TypeError("connection reset");
    };
    const { status, body } = await buyAirtime();
    expect(status).toBe(503);
    expect(body.error).toMatch(/nothing was charged/i);
    expect(onlyTx().status).toBe("payment_failed");
  });
});

describe("DirectPay's bank-picker shortcut", () => {
  it("hands Mono the linked account when it was linked through the app taking the payment", async () => {
    db.table("linked_accounts")[0].mono_app_tag = await monoAppTag(PAYMENTS_KEY);
    await buyAirtime();
    expect(monoCalls[0].body.account).toBe("678f7bc977eb9afb06fff11f");
  });

  it("does not, for an account linked through the other app — Mono would refuse it", async () => {
    db.table("linked_accounts")[0].mono_app_tag = await monoAppTag(CONNECT_KEY);
    await buyAirtime();
    expect(monoCalls[0].body).not.toHaveProperty("account");
  });

  it("does not, for an account linked before the app was recorded", async () => {
    await buyAirtime();
    expect(monoCalls[0].body).not.toHaveProperty("account");
  });
});
