import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";

/**
 * mono-webhook, run for real: the Edge Function imported and its handler
 * called with Requests carrying Mono's DOCUMENTED payloads, verbatim.
 *
 * The first payload below is copied unchanged from
 * https://docs.mono.co/docs/payments/onetime/webhook-events — DirectPay, the
 * mode the MVP runs on. The handler used to read the mandate shape
 * (data.reference / data.amount) and so found no reference in it at all: the
 * event was recorded as ignored, Mono was told 200, and the purchase sat at
 * `initiated` with the customer's money gone. These tests exist so that shape
 * can never again be assumed rather than checked.
 *
 * The transactions seeded below use the documented reference and amount so
 * the payloads need no editing to match them.
 */

const WEBHOOK_SECRET = "whsec-fixture-0123456789abcdef"; // secret-scan: allow — fake fixture, not a credential
const SERVICE_ROLE = "svc-role-fixture"; // secret-scan: allow — fake fixture, not a credential

const ENV: Record<string, string | undefined> = {};
const BASE_ENV = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  MONO_WEBHOOK_SECRET: WEBHOOK_SECRET,
};

// ── Verbatim from Mono's docs ────────────────────────────────
const DOCUMENTED_SUCCESS = {
  event: "direct_debit.payment_successful",
  event_id: "PsmZW6jiY6vDuDHeFmvsiJudamnPHuKhAKyoMFPznWs",
  timestamp: "2026-01-07T10:10:50.186Z",
  data: {
    type: "onetime-debit",
    object: {
      _id: "65aa7939564a694c67789012",
      id: "txd_wzb8uhew4j9ngru43a123456",
      status: "successful",
      message: "Payment was successful",
      description: "new payment",
      amount: 20000,
      fee: 6100,
      currency: "NGN",
      liveMode: true,
      account: {
        status: "AVAILABLE",
        linked: true,
        _id: "65aa7935564a694c67123456",
        name: "SAMUEL OLAMIDE",
        accountNumber: "0123456789",
        currency: "NGN",
        balance: 50000,
        type: "SAVINGS ACCOUNT",
        bvn: null,
        authMethod: "mobile_banking",
        liveMode: true,
        app: "61e3798cbbe2010771123456",
        institution: {
          _id: "5f2d08c060b92e2888287707",
          name: "First Bank",
          bankCode: "011",
          type: "PERSONAL_BANKING",
          icon: "https://mono-public-bucket.s3.eu-west-2.amazonaws.com/images/first-bank-icon.png",
        },
        scope: ["payments"],
        created_at: "2021-07-18T18:54:23.491Z",
        updated_at: "2021-07-18T18:55:16.055Z",
      },
      reference: "123456789012",
      verified: true,
      business: "60cc8f95ba1772018c123456",
      created_at: "2021-08-18T18:54:23.491Z",
      updated_at: "2021-08-18T18:55:16.055Z",
      method: "transfer",
      flagged: false,
      flag_reasons: null,
      held_settlement: false,
    },
  },
};

const DOCUMENTED_FAILED = {
  event: "direct_debit.payment_failed",
  event_id: "PsmZW6jiY6vDuDHeFmvsiJudamnPHuKhAKyoMFPznWs",
  timestamp: "2026-01-07T10:10:50.186Z",
  data: {
    type: "onetime-debit",
    object: {
      description: "Wallet Funding",
      amount: 50000,
      fee: 4500,
      liveMode: true,
      customer: null,
      account: "618d41d61846d1e2",
      currency: "NGN",
      reference: "wp_f4719afff5234d60c0570e",
      status: "failed",
      id: "txd_XzhFBoknIjuosOz4",
      created_at: "2024-05-04T17:48:33.627Z",
      updated_at: "2024-05-04T17:49:06.211Z",
    },
  },
};
// ─────────────────────────────────────────────────────────────

const SUCCESS_REF = "123456789012"; // ₦200 = 20000 kobo, as documented
const FAILED_REF = "wp_f4719afff5234d60c0570e"; // ₦500 = 50000 kobo

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let fulfilCalls: { url: string; auth: string | null; body: Record<string, unknown> }[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/mono-webhook/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("mono-webhook did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);

  db = new FakeSupabase(
    {
      transactions: [
        {
          id: "tx-ok", reference: SUCCESS_REF, user_id: "user-1", customer_id: "cust-1",
          status: "initiated", amount: 200, mono_payment_id: "ODW2QV0WLIDG",
          service_type: "airtime", provider: "mtn", beneficiary: "08011111111",
        },
        {
          id: "tx-fail", reference: FAILED_REF, user_id: "user-1", customer_id: "cust-1",
          status: "initiated", amount: 500, mono_payment_id: "ODW2QV0XYZ12",
          service_type: "airtime", provider: "mtn", beneficiary: "08011111111",
        },
      ],
      push_tokens: [],
    },
    // The real unique index: webhook_events_provider_event_key.
    { webhook_events: ["provider", "event_id"] },
  );
  (globalThis as any).__fakeSupabase = db;

  fulfilCalls = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === `${BASE_ENV.SUPABASE_URL}/functions/v1/vtu-service`) {
      fulfilCalls.push({
        url,
        auth: (init?.headers as Record<string, string>)?.Authorization ?? null,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function deliver(payload: unknown, secret: string | null = WEBHOOK_SECRET) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/mono-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret === null ? {} : { "mono-webhook-secret": secret }),
      },
      body: JSON.stringify(payload),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const tx = (reference: string) => db.table("transactions").find((t) => t.reference === reference)!;
const events = (reference: string) => db.table("transaction_events").filter((e) => e.reference === reference);
const withEvent = (base: typeof DOCUMENTED_FAILED, event: string, eventId: string) => ({
  ...base,
  event,
  event_id: eventId,
});

// ─────────────────────────────────────────────────────────────

describe("Mono's documented DirectPay success event", () => {
  it("marks the transaction paid and hands it to vtu-service to fulfil", async () => {
    const { status, body } = await deliver(DOCUMENTED_SUCCESS);

    expect(status).toBe(200);
    expect(body.result).toBe("paid");
    expect(tx(SUCCESS_REF).status).toBe("paid");

    // Fulfilment is asked for exactly once, as the service role, by reference.
    expect(fulfilCalls).toEqual([
      {
        url: `${BASE_ENV.SUPABASE_URL}/functions/v1/vtu-service`,
        auth: `Bearer ${SERVICE_ROLE}`,
        body: { action: "fulfil", reference: SUCCESS_REF },
      },
    ]);
  });

  it("reads the amount from data.object, in kobo — 20000 kobo is the ₦200 priced", async () => {
    await deliver(DOCUMENTED_SUCCESS);
    const paid = events(SUCCESS_REF).find((e) => e.to_status === "paid")!;
    expect((paid.metadata as Record<string, unknown>).paidAmount).toBe(200);
  });

  it("never overwrites the payment id a refund is sent against", async () => {
    // vtu-service stored ODW2QV0WLIDG when it initiated. The old code wrote
    // data.id ?? null over it, and data.id does not exist on DirectPay.
    await deliver(DOCUMENTED_SUCCESS);
    expect(tx(SUCCESS_REF).mono_payment_id).toBe("ODW2QV0WLIDG");
    // Mono's transaction id is kept, on the event.
    const paid = events(SUCCESS_REF).find((e) => e.to_status === "paid")!;
    expect((paid.metadata as Record<string, unknown>).monoTransactionId).toBe("txd_wzb8uhew4j9ngru43a123456");
  });

  it("takes Mono's id only when the row has none", async () => {
    tx(SUCCESS_REF).mono_payment_id = null;
    await deliver(DOCUMENTED_SUCCESS);
    expect(tx(SUCCESS_REF).mono_payment_id).toBe("txd_wzb8uhew4j9ngru43a123456");
  });

  it("records the event under Mono's event_id, so a redelivery is recognised", async () => {
    await deliver(DOCUMENTED_SUCCESS);
    expect(db.table("webhook_events")).toHaveLength(1);
    expect(db.table("webhook_events")[0]).toMatchObject({
      provider: "mono",
      event_id: "PsmZW6jiY6vDuDHeFmvsiJudamnPHuKhAKyoMFPznWs",
      reference: SUCCESS_REF,
      result: "paid",
    });
  });

  it("does nothing on a redelivery — no second fulfilment", async () => {
    await deliver(DOCUMENTED_SUCCESS);
    const again = await deliver(DOCUMENTED_SUCCESS);

    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(fulfilCalls).toHaveLength(1);
    expect(events(SUCCESS_REF).filter((e) => e.to_status === "paid")).toHaveLength(1);
  });
});

describe("the ways a DirectPay payment ends without money moving", () => {
  it("Mono's documented failed event marks it payment_failed and fulfils nothing", async () => {
    const { status, body } = await deliver(DOCUMENTED_FAILED);

    expect(status).toBe(200);
    expect(body.result).toBe("payment_failed");
    expect(tx(FAILED_REF).status).toBe("payment_failed");
    expect(tx(FAILED_REF).failure_reason).toBe("bank declined");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("cancelled is payment_failed, recorded as a cancellation", async () => {
    await deliver(withEvent(DOCUMENTED_FAILED, "direct_debit.payment_cancelled", "evt-cancel-1"));
    expect(tx(FAILED_REF).status).toBe("payment_failed");
    expect(tx(FAILED_REF).failure_reason).toBe("payment cancelled");
  });

  it("abandoned is payment_failed — it used to match nothing and sit at initiated", async () => {
    await deliver(withEvent(DOCUMENTED_FAILED, "direct_debit.payment_abandoned", "evt-abandon-1"));
    expect(tx(FAILED_REF).status).toBe("payment_failed");
    expect(tx(FAILED_REF).failure_reason).toBe("customer abandoned the payment");
    expect(fulfilCalls).toHaveLength(0);
  });
});

describe("nothing is spent on doubt", () => {
  it("quarantines a success whose amount is not what we priced", async () => {
    const short = structuredClone(DOCUMENTED_SUCCESS);
    short.data.object.amount = 19900;
    short.event_id = "evt-short-1";

    const { body } = await deliver(short);

    expect(body.result).toBe("quarantined:amount_mismatch");
    expect(tx(SUCCESS_REF).status).toBe("quarantined");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("quarantines a success EVENT whose payment object says it failed", async () => {
    const contradictory = structuredClone(DOCUMENTED_SUCCESS);
    contradictory.data.object.status = "failed";
    contradictory.event_id = "evt-contradiction-1";

    const { body } = await deliver(contradictory);

    expect(body.result).toBe("quarantined:status_contradiction");
    expect(tx(SUCCESS_REF).status).toBe("quarantined");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("quarantines a success that carries no amount at all", async () => {
    const noAmount = structuredClone(DOCUMENTED_SUCCESS) as any;
    delete noAmount.data.object.amount;
    noAmount.event_id = "evt-no-amount-1";

    expect((await deliver(noAmount)).body.result).toBe("quarantined:amount_mismatch");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("leaves a transaction that is no longer initiated alone", async () => {
    tx(SUCCESS_REF).status = "paid";
    const { body } = await deliver(DOCUMENTED_SUCCESS);
    expect(body.result).toBe("ignored:already_paid");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("cannot create a transaction for a reference we never issued", async () => {
    const stranger = structuredClone(DOCUMENTED_SUCCESS);
    stranger.data.object.reference = "NOT-OURS-000";
    stranger.event_id = "evt-stranger-1";

    const { status, body } = await deliver(stranger);

    expect(status).toBe(200);
    expect(body.result).toBe("ignored:unknown_reference");
    expect(db.table("transactions")).toHaveLength(2);
    expect(fulfilCalls).toHaveLength(0);
  });
});

describe("only Mono can call it", () => {
  it("rejects a request with no secret header, before reading anything", async () => {
    const { status } = await deliver(DOCUMENTED_SUCCESS, null);
    expect(status).toBe(401);
    expect(db.table("webhook_events")).toHaveLength(0);
    expect(tx(SUCCESS_REF).status).toBe("initiated");
  });

  it("rejects a wrong secret", async () => {
    const { status } = await deliver(DOCUMENTED_SUCCESS, "guessed-secret");
    expect(status).toBe(401);
    expect(tx(SUCCESS_REF).status).toBe("initiated");
    expect(fulfilCalls).toHaveLength(0);
  });

  it("rejects everyone while MONO_WEBHOOK_SECRET is unset — fails closed", async () => {
    delete ENV.MONO_WEBHOOK_SECRET;
    const { status } = await deliver(DOCUMENTED_SUCCESS, WEBHOOK_SECRET);
    expect(status).toBe(401);
    expect(tx(SUCCESS_REF).status).toBe("initiated");
  });
});

describe("the mandate shape still works, as the fallback", () => {
  it("reads a flat data.reference_number / data.amount / data.id debit event", async () => {
    tx(SUCCESS_REF).mono_payment_id = null;
    const { body } = await deliver({
      event: "events.mandates.debit.successful",
      event_id: "evt-mandate-1",
      data: { reference_number: SUCCESS_REF, amount: 20000, id: "mandate-debit-1" },
    });

    expect(body.result).toBe("paid");
    expect(tx(SUCCESS_REF).mono_payment_id).toBe("mandate-debit-1");
    expect(fulfilCalls).toHaveLength(1);
  });
});
