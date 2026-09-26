import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";

/**
 * mono-webhook and quick pay, run for real: the Edge Function imported and
 * called with Requests carrying Mono's DOCUMENTED Direct Debit payloads.
 * https://docs.mono.co/docs/payments/direct-debit/webhook-events
 *
 * `events.mandates.ready` is what turns on fingerprint-only purchases for an
 * account, so it is held to the payment rules: found only by what we recorded
 * at setup, advanced only forward, refused when it is on the wrong account,
 * and never confused with a purchase.
 */

const WEBHOOK_SECRET = "whsec-fixture-0123456789abcdef"; // secret-scan: allow — fake fixture, not a credential
const SERVICE_ROLE = "svc-role-fixture"; // secret-scan: allow — fake fixture, not a credential

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  MONO_WEBHOOK_SECRET: WEBHOOK_SECRET,
};

// ── Mono's documented examples ───────────────────────────────
const CREATED = {
  event: "events.mandates.created",
  event_id: "65f9c4a2e1b123456789",
  timestamp: "2023-12-14T10:41:42.016Z",
  data: {
    id: "mmc_664b428e362a3",
    status: "initiated",
    mandate_type: "emandate",
    debit_type: "variable",
    ready_to_debit: false,
    approved: false,
    reference: "ZONO240520",
    account_name: "Samuel Olamide",
    account_number: "0100013078",
    customer: "664769512f321a8c",
    amount: 200020,
  },
};
const APPROVED = {
  event: "events.mandates.approved",
  event_id: "65f9c4a2e1b123456790",
  data: {
    id: "mmc_664b428e362a3",
    status: "approved",
    approved: true,
    ready_to_debit: false,
    customer: "664769512f321a8c",
    amount: 200020,
  },
};
const READY = {
  event: "events.mandates.ready",
  event_id: "65f9c4a2e1b123456791",
  data: {
    id: "mmc_664b428e362a3",
    status: "approved",
    ready_to_debit: true,
    approved: true,
    customer: "664769512f321a8c",
    amount: 200000,
  },
};
const REJECTED = {
  event: "events.mandates.rejected",
  event_id: "65f9c4a2e1b123456792",
  data: { id: "mmc_664b428e362a3", status: "rejected", approved: false, customer: "664769512f321a8c" },
};
const CANCELLED = {
  event: "events.mandate.action.cancel",
  event_id: "65f9c4a2e1b123456793",
  data: { mandate: "mmc_664b428e362a3", status: "success", message: "Mandate now cancelled; cannot be reused" },
};
const DEBIT_SUCCESSFUL = {
  event: "events.mandates.debit.successful",
  event_id: "65f9c4a2e1b123456794",
  data: {
    success: true,
    status: "successful",
    amount: 50000,
    mandate: "mmc_6571f4e55c7d1843d7d162e9",
    reference_number: "Ah20141329b841234",
    customer: "6570ee1115ddbc5528fea1c8",
  },
};
// ─────────────────────────────────────────────────────────────

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let fulfilCalls: Record<string, unknown>[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/mono-webhook/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

beforeEach(() => {
  db = new FakeSupabase(
    {
      linked_accounts: [{ id: "acct-1", user_id: "user-1", account_number: "0100013078", is_active: true }],
      mono_mandates: [
        {
          id: "mandate-1", user_id: "user-1", linked_account_id: "acct-1", status: "pending",
          reference: "ZONO240520", mono_mandate_id: null, max_total: 2000.2,
        },
      ],
      transactions: [
        // A purchase that happens to share the mandate's setup reference. A
        // mandate's events must never be read as this purchase's outcome.
        { id: "tx-same-ref", reference: "ZONO240520", status: "initiated", amount: 200, mono_payment_id: null },
        // A quick-pay purchase: our reference, and Mono's reference_number from
        // the debit response stored as mono_payment_id.
        {
          id: "tx-qp", reference: "MP-BIL-QP-1", user_id: "user-1", status: "initiated", amount: 500,
          mono_payment_id: "Ah20141329b841234", mono_mandate_id: "mmc_6571f4e55c7d1843d7d162e9",
          service_type: "airtime", provider: "mtn", beneficiary: "08011111111",
        },
      ],
      push_tokens: [],
    },
    { webhook_events: ["provider", "event_id"] },
  );
  (globalThis as any).__fakeSupabase = db;

  fulfilCalls = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith("/functions/v1/vtu-service")) {
      fulfilCalls.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${String(input)}`);
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
      headers: { "Content-Type": "application/json", ...(secret ? { "mono-webhook-secret": secret } : {}) },
      body: JSON.stringify(payload),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const mandate = () => db.table("mono_mandates").find((m) => m.id === "mandate-1")!;
const tx = (id: string) => db.table("transactions").find((t) => t.id === id)!;
const again = <T extends { event_id: string }>(payload: T, suffix: string): T => ({
  ...payload,
  event_id: payload.event_id + suffix,
});

describe("a mandate's setup, event by event", () => {
  it("created: finds our row by the setup reference and records Mono's id — nothing turns on", async () => {
    const { status, body } = await deliver(CREATED);
    expect(status).toBe(200);
    expect(body.result).toMatch(/^ignored:mandate_created/);
    expect(mandate().mono_mandate_id).toBe("mmc_664b428e362a3");
    expect(mandate().status).toBe("pending");
  });

  it("approved: the ₦50 arrived — recorded, still not usable", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    const { body } = await deliver(APPROVED);
    expect(body.result).toBe("mandate:pending");
    expect(mandate().status).toBe("pending");
    expect(mandate().authorised_at).toBeTruthy();
  });

  it("ready: quick pay is on", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    const { body } = await deliver(READY);
    expect(body.result).toBe("mandate:active");
    expect(mandate().status).toBe("active");
    expect(mandate().ready_at).toBeTruthy();
  });

  it("the whole documented sequence ends active", async () => {
    for (const event of [CREATED, APPROVED, READY]) await deliver(event);
    expect(mandate()).toMatchObject({ status: "active", mono_mandate_id: "mmc_664b428e362a3" });
  });

  it("rejected: failed, with the reason kept for staff", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    const { body } = await deliver(REJECTED);
    expect(body.result).toBe("mandate:rejected");
    expect(mandate().status).toBe("rejected");
    expect(mandate().failure_reason).toBeTruthy();
  });

  it("cancel (keyed data.mandate, not data.id): switched off", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    mandate().status = "active";
    const { body } = await deliver(CANCELLED);
    expect(body.result).toBe("mandate:revoked");
    expect(mandate().status).toBe("revoked");
    expect(mandate().revoked_at).toBeTruthy();
  });
});

describe("what can never happen", () => {
  it("a mandate set up on a DIFFERENT account from the one chosen is refused, not activated", async () => {
    db.table("linked_accounts")[0].account_number = "9999999999";
    const { body } = await deliver(CREATED);
    expect(body.result).toBe("mandate:rejected_wrong_account");
    expect(mandate().status).toBe("rejected");

    // And a later ready for it does nothing.
    await deliver(READY);
    expect(mandate().status).toBe("rejected");
  });

  it("a ready after the customer switched it off does not switch it back on", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    mandate().status = "revoked";
    const { body } = await deliver(READY);
    expect(body.result).toMatch(/^ignored:/);
    expect(mandate().status).toBe("revoked");
  });

  it("an event for a mandate we never set up changes nothing and stops Mono retrying", async () => {
    const { status, body } = await deliver({
      ...READY,
      data: { ...READY.data, id: "mmc_not_ours" },
    });
    expect(status).toBe(200);
    expect(body.result).toBe("ignored:unknown_mandate");
    expect(mandate().status).toBe("pending");
  });

  it("a forged ready is rejected before anything is read", async () => {
    mandate().mono_mandate_id = "mmc_664b428e362a3";
    const { status } = await deliver(READY, "not-the-secret");
    expect(status).toBe(401);
    expect(mandate().status).toBe("pending");
    expect(db.table("webhook_events")).toHaveLength(0);
  });

  it("a mandate's events never touch a purchase — even one with the same reference", async () => {
    await deliver(CREATED);
    await deliver({ ...REJECTED, data: { ...REJECTED.data } });
    expect(tx("tx-same-ref").status).toBe("initiated");
    expect(fulfilCalls).toHaveLength(0);
  });
});

describe("money moving under a mandate", () => {
  it("finds the quick-pay purchase by Mono's reference_number, and fulfils it by OUR reference", async () => {
    const { body } = await deliver(DEBIT_SUCCESSFUL);
    expect(body.result).toBe("paid");
    expect(tx("tx-qp").status).toBe("paid");
    // Fulfilment is asked for by our reference, not Mono's.
    expect(fulfilCalls).toEqual([{ action: "fulfil", reference: "MP-BIL-QP-1" }]);
    // And the id refunds are sent against is untouched.
    expect(tx("tx-qp").mono_payment_id).toBe("Ah20141329b841234");
  });

  it("still checks the amount: a debit that is not what we priced is held, not fulfilled", async () => {
    tx("tx-qp").amount = 600;
    const { body } = await deliver(DEBIT_SUCCESSFUL);
    expect(body.result).toBe("quarantined:amount_mismatch");
    expect(fulfilCalls).toHaveLength(0);
  });
});

describe("a delivery that did not finish", () => {
  it("is processed when Mono retries it, instead of being dropped as a duplicate", async () => {
    // As if an earlier delivery recorded the event, then hit an error and
    // answered 503 — which is exactly what asks Mono to retry.
    db.table("webhook_events").push({
      provider: "mono", event_id: DEBIT_SUCCESSFUL.event_id, processed_at: null,
    });

    const { body } = await deliver(DEBIT_SUCCESSFUL);

    expect(body.result).toBe("paid");
    expect(tx("tx-qp").status).toBe("paid");
    expect(fulfilCalls).toHaveLength(1);
  });

  it("a FINISHED one is still a duplicate, and nothing happens twice", async () => {
    await deliver(DEBIT_SUCCESSFUL);
    const second = await deliver(DEBIT_SUCCESSFUL);
    expect(second.body.duplicate).toBe(true);
    expect(fulfilCalls).toHaveLength(1);
  });

  it("two passes at an unfinished one still fulfil only once", async () => {
    db.table("webhook_events").push({
      provider: "mono", event_id: DEBIT_SUCCESSFUL.event_id, processed_at: null,
    });
    // Neither pass has finished when the other starts.
    await Promise.all([deliver(DEBIT_SUCCESSFUL), deliver(again(DEBIT_SUCCESSFUL, ""))]);
    expect(tx("tx-qp").status).toBe("paid");
    expect(fulfilCalls).toHaveLength(1);
  });
});
