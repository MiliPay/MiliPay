import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { monoAppTag } from "../supabase/functions/_shared/mono-app-tag";

/**
 * mono-mandate — turning quick pay on, reading it, turning it off — run for
 * real: the Edge Function imported, its handler called with real Requests,
 * the database in memory and Mono stood in for at fetch.
 *
 * Nothing here moves money, but setup is what eventually lets a fingerprint
 * alone debit a bank account, so it is held to: the caller's own account
 * only, every detail Mono needs present, one mandate per account, the BVN
 * never logged, and switching off always possible.
 */

const CONNECT_KEY = "test_sk_connect_fixture"; // secret-scan: allow — fake fixture, not a credential
const PAYMENTS_KEY = "test_sk_payments_fixture"; // secret-scan: allow — fake fixture, not a credential
const ACCT_1 = "11111111-1111-4111-8111-111111111111";
const ACCT_2 = "22222222-2222-4222-8222-222222222222";
const BVN = "22233344455"; // secret-scan: allow — fake fixture, not a credential

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  VTU_FULFILMENT_MODE: "live",
  MILIPAY_ENVIRONMENT: "sandbox",
  VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
  MONO_SECRET_KEY: CONNECT_KEY,
  MONO_PAYMENTS_SECRET_KEY: PAYMENTS_KEY,
  MONO_PAYMENT_MODE: "mandate",
};
const ENV: Record<string, string | undefined> = {};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let monoCalls: { path: string; method: string; key: string | null; body: Record<string, unknown> }[];
let monoAnswer: (path: string, method: string) => { status?: number; body: unknown } | undefined;
let logged: string[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/mono-mandate/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("mono-mandate did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);

  db = new FakeSupabase({
    customers: [
      {
        id: "cust-1", auth_user_id: "user-1", status: "active",
        first_name: "Samuel", last_name: "Olamide", email: "samuel@example.com",
        phone: "08012345678", address: "Agungi, Lagos", bvn: BVN,
        mono_customer_id: null, mono_customer_app_tag: null,
      },
    ],
    linked_accounts: [
      {
        id: ACCT_1, user_id: "user-1", is_active: true, account_number: "0123456789",
        mono_account_id: "acc_mono_1", bank_code: null,
      },
      {
        id: ACCT_2, user_id: "user-2", is_active: true, account_number: "0999999999",
        mono_account_id: "acc_mono_2", bank_code: "058",
      },
    ],
    mono_mandates: [],
    transactions: [],
  });
  db.users.set("tok-1", { id: "user-1", email: "samuel@example.com" });
  db.users.set("tok-2", { id: "user-2", email: "other@example.com" });
  db.rpcAnswers.set("consume_rate_limit", () => true);
  (globalThis as any).__fakeSupabase = db;

  monoCalls = [];
  monoAnswer = () => undefined;
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "api.withmono.com") throw new Error(`unexpected outbound call to ${url}`);
    const method = init?.method ?? "GET";
    const call = {
      path: url.pathname,
      method,
      key: (init?.headers as Record<string, string>)["mono-sec-key"] ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    monoCalls.push(call);
    const custom = monoAnswer(call.path, method);
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (custom) return respond(custom.body, custom.status);
    if (call.path === "/v2/customers") return respond({ status: "successful", data: { id: "cus_mono_1" } });
    if (call.path === "/v2/accounts/acc_mono_1") {
      return respond({ data: { account: { institution: { name: "GTBank", bank_code: "058" } } } });
    }
    if (call.path === "/v2/payments/initiate") {
      return respond({
        status: "successful",
        data: { mandate_id: "mmc_new_1", mono_url: "https://authorise.mono.co/RD1", reference: call.body.reference },
      });
    }
    if (call.path.endsWith("/cancel")) return respond({ status: "successful" });
    throw new Error(`no answer for ${method} ${call.path}`);
  }) as typeof fetch;

  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function send(body: Record<string, unknown>, token: string | null = "tok-1") {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/mono-mandate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const mandates = () => db.table("mono_mandates");
const setup = (overrides: Record<string, unknown> = {}, token = "tok-1") =>
  send({ action: "setup", linkedAccountId: ACCT_1, allowance: 50_000, ...overrides }, token);

// ─────────────────────────────────────────────────────────────

describe("turning quick pay on", () => {
  it("creates the Mono customer, reads the bank code, starts the mandate, and returns Mono's page", async () => {
    const { status, body } = await setup();

    expect(status).toBe(200);
    expect(body.authorisationUrl).toBe("https://authorise.mono.co/RD1");

    // The three Mono calls, in order, each with the right app's key.
    expect(monoCalls.map((c) => [c.method, c.path, c.key])).toEqual([
      ["POST", "/v2/customers", PAYMENTS_KEY],
      ["GET", "/v2/accounts/acc_mono_1", CONNECT_KEY],
      ["POST", "/v2/payments/initiate", PAYMENTS_KEY],
    ]);
    expect(monoCalls[2].body).toMatchObject({
      type: "recurring-debit",
      debit_type: "variable",
      amount: 5_000_000,
      account_number: "0123456789",
      bank_code: "058",
      customer: { id: "cus_mono_1" },
    });

    // The row was written with the reference Mono was given, and Mono's id.
    expect(mandates()).toHaveLength(1);
    expect(mandates()[0]).toMatchObject({
      user_id: "user-1",
      customer_id: "cust-1",
      linked_account_id: ACCT_1,
      status: "pending",
      reference: monoCalls[2].body.reference,
      max_total: 50_000,
      mono_mandate_id: "mmc_new_1",
    });

    // Kept for next time: the Mono customer (with the app it belongs to) and the bank code.
    const customer = db.table("customers")[0];
    expect(customer.mono_customer_id).toBe("cus_mono_1");
    expect(customer.mono_customer_app_tag).toBe(await monoAppTag(PAYMENTS_KEY));
    expect(db.table("linked_accounts")[0].bank_code).toBe("058");
  });

  it("reuses the Mono customer and bank code it already has — no second customer at Mono", async () => {
    const customer = db.table("customers")[0];
    customer.mono_customer_id = "cus_existing";
    customer.mono_customer_app_tag = await monoAppTag(PAYMENTS_KEY);
    db.table("linked_accounts")[0].bank_code = "058";

    await setup();

    expect(monoCalls.map((c) => c.path)).toEqual(["/v2/payments/initiate"]);
    expect(monoCalls[0].body.customer).toEqual({ id: "cus_existing" });
  });

  it("does NOT reuse a Mono customer made under a different Mono app", async () => {
    const customer = db.table("customers")[0];
    customer.mono_customer_id = "cus_from_old_app";
    customer.mono_customer_app_tag = await monoAppTag(CONNECT_KEY);

    await setup();

    expect(monoCalls[0].path).toBe("/v2/customers");
    expect(db.table("customers")[0].mono_customer_id).toBe("cus_mono_1");
  });

  it("never writes the BVN to the logs, even when Mono's refusal quotes it back", async () => {
    monoAnswer = (path) =>
      path === "/v2/customers" ? { status: 400, body: { message: `BVN ${BVN} does not match` } } : undefined;

    const { status, body } = await setup();

    expect(status).toBe(502);
    expect(body.error).toMatch(/nothing was charged/i);
    expect(logged.join("\n")).not.toContain(BVN);
    expect(JSON.stringify(body)).not.toContain(BVN);
  });

  it("closes the row when Mono will not start it, so the customer can simply try again", async () => {
    monoAnswer = (path) =>
      path === "/v2/payments/initiate" ? { status: 403, body: { message: "Direct Debit not enabled" } } : undefined;

    const { status, body } = await setup();

    expect(status).toBe(502);
    expect(body.error).toMatch(/nothing was charged/i);
    expect(body.error).not.toMatch(/bank (declined|rejected)/i);
    expect(mandates()[0].status).toBe("expired");

    // And a retry is allowed.
    monoAnswer = () => undefined;
    expect((await setup()).status).toBe(200);
  });
});

describe("what setup refuses", () => {
  it("everything, while quick pay is not switched on for the business — and calls Mono for none of it", async () => {
    delete ENV.MONO_PAYMENT_MODE;
    const { status, body } = await setup();
    expect(status).toBe(503);
    expect(body.code).toBe("QUICK_PAY_UNAVAILABLE");
    expect(monoCalls).toHaveLength(0);
  });

  it("another customer's account", async () => {
    const { status } = await setup({ linkedAccountId: ACCT_2 });
    expect(status).toBe(403);
    expect(monoCalls).toHaveLength(0);
    expect(mandates()).toHaveLength(0);
  });

  it("an allowance that was not offered", async () => {
    expect((await setup({ allowance: 1_000_000 })).status).toBe(400);
    expect(monoCalls).toHaveLength(0);
  });

  it("a customer missing what Mono needs — and says which, never the values", async () => {
    db.table("customers")[0].email = null;
    db.table("customers")[0].address = "";

    const { status, body } = await setup();

    expect(status).toBe(400);
    expect(body.code).toBe("DETAILS_MISSING");
    expect(body.missing).toEqual(["email address", "home address"]);
    expect(monoCalls).toHaveLength(0);
  });

  it("a second mandate on an account that already has quick pay", async () => {
    mandates().push({ id: "m-on", user_id: "user-1", linked_account_id: ACCT_1, status: "active" });
    const { status, body } = await setup();
    expect(status).toBe(409);
    expect(body.code).toBe("QUICK_PAY_EXISTS");
    expect(monoCalls).toHaveLength(0);
  });

  it("starting over while the bank is activating one the customer already paid ₦50 for", async () => {
    mandates().push({
      id: "m-approved", user_id: "user-1", linked_account_id: ACCT_1, status: "pending",
      authorised_at: "2026-09-26T09:00:00Z",
    });
    const { status, body } = await setup();
    expect(status).toBe(409);
    expect(body.code).toBe("QUICK_PAY_ACTIVATING");
  });

  it("but replaces a setup the customer never finished, cancelling it at Mono", async () => {
    mandates().push({
      id: "m-abandoned", user_id: "user-1", linked_account_id: ACCT_1, status: "pending",
      mono_mandate_id: "mmc_abandoned", authorised_at: null,
    });

    const { status } = await setup();

    expect(status).toBe(200);
    expect(mandates().find((m) => m.id === "m-abandoned")!.status).toBe("expired");
    expect(monoCalls.some((c) => c.method === "PATCH" && c.path === "/v3/payments/mandates/mmc_abandoned/cancel"))
      .toBe(true);
  });

  it("a caller with no session", async () => {
    expect((await setup({}, null as unknown as string)).status).toBe(401);
  });
});

describe("reading quick pay", () => {
  it("reports each linked account, and whether quick pay is offered at all", async () => {
    const { body } = await send({ action: "status" });
    expect(body.available).toBe(true);
    expect(body.allowances).toEqual([20_000, 50_000, 100_000]);
    expect(body.missingDetails).toEqual([]);
    expect(body.accounts).toEqual([
      { linkedAccountId: ACCT_1, state: "off", allowance: null, remaining: null, bankApproved: false, failure: null },
    ]);
    expect(JSON.stringify(body)).not.toContain(BVN);
  });

  it("shows what is left of the allowance once it is on", async () => {
    mandates().push({
      id: "m-on", user_id: "user-1", linked_account_id: ACCT_1, status: "active",
      mono_mandate_id: "mmc_on", max_total: 20_000, created_at: "2026-09-20T10:00:00Z",
    });
    db.table("transactions").push(
      { reference: "a", mono_mandate_id: "mmc_on", status: "delivered", amount: 1_500 },
      { reference: "b", mono_mandate_id: "mmc_on", status: "payment_failed", amount: 9_000 },
    );

    const { body } = await send({ action: "status" });

    expect(body.accounts[0]).toMatchObject({ state: "on", allowance: 20_000, remaining: 18_500 });
  });

  it("is not offered while switched off for the business", async () => {
    delete ENV.MONO_PAYMENT_MODE;
    expect((await send({ action: "status" })).body.available).toBe(false);
  });
});

describe("turning quick pay off", () => {
  beforeEach(() => {
    mandates().push({
      id: "m-on", user_id: "user-1", linked_account_id: ACCT_1, status: "active", mono_mandate_id: "mmc_on",
    });
  });

  it("switches it off here and cancels it at Mono", async () => {
    const { status } = await send({ action: "cancel", linkedAccountId: ACCT_1 });
    expect(status).toBe(200);
    expect(mandates()[0].status).toBe("revoked");
    expect(monoCalls).toEqual([
      expect.objectContaining({ method: "PATCH", path: "/v3/payments/mandates/mmc_on/cancel", key: PAYMENTS_KEY }),
    ]);
  });

  it("is off here even when Mono cannot be reached — MiliPay never debits it again", async () => {
    monoAnswer = () => ({ status: 500, body: { message: "down" } });
    const { status } = await send({ action: "cancel", linkedAccountId: ACCT_1 });
    expect(status).toBe(200);
    expect(mandates()[0].status).toBe("revoked");
  });

  it("works even while quick pay is switched off for the business", async () => {
    delete ENV.MONO_PAYMENT_MODE;
    await send({ action: "cancel", linkedAccountId: ACCT_1 });
    expect(mandates()[0].status).toBe("revoked");
  });

  it("cannot touch another customer's mandate", async () => {
    await send({ action: "cancel", linkedAccountId: ACCT_1 }, "tok-2");
    expect(mandates()[0].status).toBe("active");
    expect(monoCalls).toHaveLength(0);
  });
});
