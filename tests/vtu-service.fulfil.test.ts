import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { requestId } from "../supabase/functions/_shared/vtpass";

/**
 * vtu-service's fulfil and requery actions, run for real.
 *
 * The Edge Function is imported and its handler called with real Requests.
 * vtu-service, vtpass.ts, vtu-state.ts, transactions.ts and auth.ts all run
 * unmodified. Only three things are stood in for: Deno's serve() (to hand the
 * handler to the test), the database (an in-memory table the test seeds and
 * then inspects), and fetch — which captures the exact body sent to VTPass
 * and answers with responses taken from VTPass's documentation.
 *
 * That makes these tests of OUR side: what we send VTPass, and what we do
 * with each answer. They do not prove VTPass behaves as documented; the real
 * sandbox run does that.
 */

const SERVICE_ROLE = "svc-role-fixture"; // secret-scan: allow — fake fixture, not a credential
const REFERENCE = "MP-BIL-MFX2K9QZ-1A2B3C4D";
const INITIATED_AT = "2026-09-25T10:15:00.000Z";

// Deliberately different values, so a swap cannot pass by coincidence.
const CUSTOMER_PHONE_STORED = "+2348031234567";
const CUSTOMER_PHONE_SENT = "08031234567";
const METER = "1111111111111";
const SMARTCARD = "1212121212";
const RECIPIENT = "08011111111";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
  VTPASS_API_KEY: "api-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_SECRET_KEY: "sk-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_PUBLIC_KEY: "pk-fixture", // secret-scan: allow — fake fixture, not a credential
};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;

interface VtpassCall {
  path: string;
  body: Record<string, unknown>;
}
let vtpassCalls: VtpassCall[];
let vtpassAnswer: (call: VtpassCall) => Response | Promise<Response>;
let db: FakeSupabase;

const realFetch = globalThis.fetch;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/vtu-service/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("vtu-service did not register a handler");
});

beforeEach(() => {
  vtpassCalls = [];
  vtpassAnswer = () => {
    throw new Error("test did not say how VTPass should answer");
  };
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(ENV.VTPASS_BASE_URL)) {
      const call = {
        path: url.slice(ENV.VTPASS_BASE_URL.length),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      };
      vtpassCalls.push(call);
      return vtpassAnswer(call);
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function seed(tx: Record<string, unknown>) {
  db = new FakeSupabase({
    transactions: [
      {
        id: "tx-1",
        reference: REFERENCE,
        user_id: "user-1",
        customer_id: "cust-1",
        status: "paid",
        amount: 1000,
        base_amount: 1000,
        initiated_at: INITIATED_AT,
        created_at: INITIATED_AT,
        operator_transaction_id: null,
        ...tx,
      },
    ],
    customers: [{ id: "cust-1", phone: CUSTOMER_PHONE_STORED }],
    push_tokens: [],
  });
  (globalThis as any).__fakeSupabase = db;
}

async function call(action: "fulfil" | "requery", bearer = SERVICE_ROLE) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/vtu-service", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, reference: REFERENCE }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const row = () => db.table("transactions")[0];
const statuses = () => db.table("transaction_events").map((e) => `${e.from_status}->${e.to_status}`);

// ─────────────────────────────────────────────────────────────

describe("bill payments: the meter or card is the identifier, the CUSTOMER's phone is the phone", () => {
  it("electricity sends the meter as billersCode and the customer's phone as phone", async () => {
    seed({ service_type: "power", provider: "ikedc", beneficiary: METER, variation_code: "prepaid" });
    vtpassAnswer = () =>
      json({
        code: "000",
        content: { transactions: { status: "delivered", transactionId: "17416102247366731230557150" } },
        purchased_code: "Token : 26362054405982757802",
        units: "79.9 kWh",
      });

    const { body } = await call("fulfil");

    expect(vtpassCalls).toHaveLength(1);
    const sent = vtpassCalls[0];
    expect(sent.path).toBe("/pay");
    expect(sent.body.serviceID).toBe("ikeja-electric");
    expect(sent.body.billersCode).toBe(METER);
    expect(sent.body.phone).toBe(CUSTOMER_PHONE_SENT);
    expect(sent.body.variation_code).toBe("prepaid");
    // And neither was substituted for the other.
    expect(sent.body.phone).not.toBe(METER);
    expect(sent.body.billersCode).not.toBe(CUSTOMER_PHONE_SENT);

    expect(body.status).toBe("delivered");
    expect(row().status).toBe("delivered");
    expect(row().token).toBe("26362054405982757802");
    expect(row().units).toBe("79.9 kWh");
    expect(String(row().units)).not.toContain(METER);
  });

  it("DStv sends the smartcard as billersCode, the customer's phone, and subscription_type", async () => {
    seed({ service_type: "cable", provider: "dstv", beneficiary: SMARTCARD, variation_code: "dstv-padi" });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    await call("fulfil");

    const sent = vtpassCalls[0].body;
    expect(sent.serviceID).toBe("dstv");
    expect(sent.billersCode).toBe(SMARTCARD);
    expect(sent.phone).toBe(CUSTOMER_PHONE_SENT);
    expect(sent.phone).not.toBe(SMARTCARD);
    expect(sent.variation_code).toBe("dstv-padi");
    expect(sent.subscription_type).toBe("change");
  });

  it("GOtv does the same", async () => {
    seed({ service_type: "cable", provider: "gotv", beneficiary: SMARTCARD, variation_code: "gotv-max" });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    await call("fulfil");

    const sent = vtpassCalls[0].body;
    expect(sent).toMatchObject({
      serviceID: "gotv",
      billersCode: SMARTCARD,
      phone: CUSTOMER_PHONE_SENT,
      variation_code: "gotv-max",
      subscription_type: "change",
    });
  });

  it("StarTimes sends no subscription_type", async () => {
    seed({ service_type: "cable", provider: "startimes", beneficiary: SMARTCARD, variation_code: "nova" });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    await call("fulfil");

    expect(vtpassCalls[0].body).toMatchObject({ serviceID: "startimes", billersCode: SMARTCARD, phone: CUSTOMER_PHONE_SENT });
    expect(vtpassCalls[0].body).not.toHaveProperty("subscription_type");
  });
});

describe("airtime and data go to the RECIPIENT, not the payer", () => {
  it("airtime: the recipient's number is the phone, in exactly the documented body", async () => {
    // The payer's own phone is on file and different. Sending it would top up
    // the wrong line.
    seed({ service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT, variation_code: null, base_amount: 200, amount: 200 });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    await call("fulfil");

    expect(vtpassCalls[0].body).toEqual({
      request_id: requestId(REFERENCE, INITIATED_AT),
      serviceID: "mtn",
      amount: 200,
      phone: RECIPIENT,
    });
    expect(vtpassCalls[0].body.phone).not.toBe(CUSTOMER_PHONE_SENT);
  });

  it("data: the recipient, the variation code, and 9mobile's serviceID is etisalat-data", async () => {
    seed({ service_type: "data", provider: "9mobile", beneficiary: RECIPIENT, variation_code: "eti-100" });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    await call("fulfil");

    expect(vtpassCalls[0].body).toMatchObject({
      serviceID: "etisalat-data",
      billersCode: RECIPIENT,
      phone: RECIPIENT,
      variation_code: "eti-100",
    });
  });
});

describe("what fulfilment does with each VTPass answer", () => {
  beforeEach(() => {
    seed({ service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT, variation_code: null });
  });

  it("000 + initiated is PENDING — not delivered, not refunded", async () => {
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "initiated", transactionId: "171" } } });

    const { body } = await call("fulfil");

    expect(body.status).toBe("fulfilment_pending");
    expect(row().status).toBe("fulfilment_pending");
    expect(db.table("refund_queue")).toHaveLength(0);
    expect(statuses()).toEqual(["paid->fulfilling", "fulfilling->fulfilment_pending"]);
  });

  it("000 + pending is pending too", async () => {
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "pending", transactionId: "171" } } });
    expect((await call("fulfil")).body.status).toBe("fulfilment_pending");
  });

  it("000 + delivered is delivered, and records VTPass's transaction id", async () => {
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } });

    expect((await call("fulfil")).body.status).toBe("delivered");
    expect(row().operator_transaction_id).toBe("171");
    expect(db.table("refund_queue")).toHaveLength(0);
  });

  it("a definite failure queues a refund", async () => {
    vtpassAnswer = () =>
      json({ code: "016", content: { transactions: { status: "failed" } }, response_description: "TRANSACTION FAILED" });

    const { body } = await call("fulfil");

    expect(body.status).toBe("refund_pending");
    expect(db.table("refund_queue")).toHaveLength(1);
    expect(db.table("refund_queue")[0]).toMatchObject({ reference: REFERENCE, amount: 1000 });
    expect(statuses()).toEqual([
      "paid->fulfilling",
      "fulfilling->fulfilment_failed",
      "fulfilment_failed->refund_pending",
    ]);
  });

  it("a timeout is pending and is NOT refunded — VTPass may have delivered", async () => {
    vtpassAnswer = () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };

    const { body } = await call("fulfil");

    expect(body.status).toBe("fulfilment_pending");
    expect(db.table("refund_queue")).toHaveLength(0);
  });

  it("no response at all is pending, not refunded", async () => {
    vtpassAnswer = () => {
      throw new TypeError("fetch failed");
    };
    expect((await call("fulfil")).body.status).toBe("fulfilment_pending");
    expect(db.table("refund_queue")).toHaveLength(0);
  });

  it("014 (request_id already used) is pending — the first submission may have delivered", async () => {
    vtpassAnswer = () => json({ code: "014", response_description: "REQUEST ID ALREADY EXIST" });
    expect((await call("fulfil")).body.status).toBe("fulfilment_pending");
    expect(db.table("refund_queue")).toHaveLength(0);
  });
});

describe("fulfilment is guarded", () => {
  it("does nothing, and calls nobody, unless the transaction is paid", async () => {
    for (const status of ["initiated", "fulfilling", "fulfilment_pending", "delivered", "refund_pending"]) {
      seed({ status, service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
      const { body } = await call("fulfil");
      expect(body.status, status).toBe(status);
    }
    expect(vtpassCalls).toHaveLength(0);
  });

  it("cannot be triggered without the service role", async () => {
    seed({ service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
    const { status } = await call("fulfil", "someone-elses-token");
    expect(status).toBe(404);
    expect(vtpassCalls).toHaveLength(0);
    expect(row().status).toBe("paid");
  });

  it("pays at most once, however many times it is asked", async () => {
    seed({ service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
    vtpassAnswer = () =>
      json({ code: "000", content: { transactions: { status: "pending", transactionId: "171" } } });

    await call("fulfil");
    await call("fulfil");
    await call("fulfil");

    expect(vtpassCalls.filter((c) => c.path === "/pay")).toHaveLength(1);
  });
});

describe("requery resolves a pending purchase by the SAME request_id", () => {
  it("asks about the request_id the purchase used, and settles delivered", async () => {
    seed({ status: "fulfilment_pending", service_type: "power", provider: "ikedc", beneficiary: METER, variation_code: "prepaid" });
    vtpassAnswer = () =>
      json({
        code: "000",
        content: { transactions: { status: "delivered", transactionId: "1741610224" } },
        purchased_code: "Token : 26362054405982757802",
        units: "79.9 kWh",
      });

    const { body } = await call("requery");

    expect(vtpassCalls).toEqual([{ path: "/requery", body: { request_id: requestId(REFERENCE, INITIATED_AT) } }]);
    expect(body.status).toBe("delivered");
    expect(row().token).toBe("26362054405982757802");
    expect(row().units).toBe("79.9 kWh");
  });

  it("leaves it pending while VTPass still says initiated", async () => {
    seed({ status: "fulfilment_pending", service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
    vtpassAnswer = () => json({ code: "000", content: { transactions: { status: "initiated" } } });

    expect((await call("requery")).body.status).toBe("fulfilment_pending");
    expect(row().status).toBe("fulfilment_pending");
  });

  it("refunds when VTPass reports the purchase failed", async () => {
    seed({ status: "fulfilment_pending", service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
    vtpassAnswer = () => json({ code: "000", content: { transactions: { status: "failed" } } });

    expect((await call("requery")).body.status).toBe("refund_pending");
    expect(db.table("refund_queue")).toHaveLength(1);
  });

  it("never pays again while resolving", async () => {
    seed({ status: "fulfilment_pending", service_type: "airtime", provider: "mtn", beneficiary: RECIPIENT });
    vtpassAnswer = () => json({ code: "015", response_description: "INVALID REQUEST ID" });

    expect((await call("requery")).body.status).toBe("fulfilment_pending");
    expect(vtpassCalls.map((c) => c.path)).toEqual(["/requery"]);
  });
});
