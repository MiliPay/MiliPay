import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";

/**
 * Approving an enrolment (redesign phase 6), run for real: approve-customer
 * imported, the database in memory, Termii and Resend stood in for at fetch.
 *
 * No password exists any more. Approval creates the sign-in identity with no
 * password and tells the customer — by SMS, WhatsApp and email — that they are
 * verified and can log in with their phone number and a code.
 */

const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  RESEND_API_KEY: "resend-fixture", // secret-scan: allow — fake fixture, not a credential
  EMAIL_FROM: "MiliPay <hello@milipay.test>",
  PASSWORD_DELIVERY_CHANNELS: "whatsapp,sms",
};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let outbound: { kind: string; to: string; text: string }[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/approve-customer/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("approve-customer did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase({
    staff_profiles: [{ id: "admin-1", role: "admin" }, { id: "agent-1", role: "agent" }],
    customers: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        first_name: "Ada",
        last_name: "Obi",
        phone: "08012345678",
        email: "ada@example.com",
        status: "pending",
        auth_user_id: null,
      },
    ],
  });
  db.users.set("tok-admin", { id: "admin-1" });
  db.users.set("tok-agent", { id: "agent-1" });
  (globalThis as any).__fakeSupabase = db;

  outbound = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.startsWith("https://api.ng.termii.com/")) {
      outbound.push({ kind: body.channel, to: body.to, text: body.sms });
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }
    if (url === "https://api.resend.com/emails") {
      outbound.push({ kind: "email", to: body.to[0], text: body.text });
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function call(body: Record<string, unknown>, token = "tok-admin") {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/approve-customer", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const customer = () => db.table("customers")[0];
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";

describe("approving an enrolment", () => {
  it("creates the sign-in identity with no password and tells the customer everywhere", async () => {
    const res = await call({ customerId: CUSTOMER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, delivered: true, status: "active" });

    expect(db.createdUsers).toHaveLength(1);
    expect(db.createdUsers[0].attributes).not.toHaveProperty("password");
    expect(db.createdUsers[0].attributes).toMatchObject({ phone: "+2348012345678", email: "ada@example.com" });
    expect(db.authUpdates).toEqual([]);

    // WhatsApp, SMS and email — every one, not just the first that worked.
    expect(outbound.map((o) => o.kind)).toEqual(["whatsapp", "dnd", "email"]);
    for (const o of outbound) {
      expect(o.text).toMatch(/verified/);
      expect(o.text).toMatch(/I've enrolled, log me in/);
      expect(o.text).not.toMatch(/password:/i);
    }

    expect(customer()).toMatchObject({
      status: "active",
      auth_user_id: db.createdUsers[0].id,
      must_change_password: true,
      password_delivery_status: "delivered",
      password_delivery_channel: "whatsapp",
    });
    // Nothing secret comes back to the portal either.
    expect(JSON.stringify(res.body)).not.toMatch(/password"/i);
  });

  it("only an administrator may approve", async () => {
    const res = await call({ customerId: CUSTOMER_ID }, "tok-agent");
    expect(res.status).toBe(403);
    expect(db.createdUsers).toEqual([]);
    expect(outbound).toEqual([]);
  });

  it("resending tells them again and changes nothing about the account", async () => {
    await call({ customerId: CUSTOMER_ID });
    customer().must_change_password = false; // they have since made a password
    outbound = [];

    const res = await call({ customerId: CUSTOMER_ID, action: "resend" });
    expect(res.status).toBe(200);
    expect(db.createdUsers).toHaveLength(1);
    expect(db.authUpdates).toEqual([]);
    expect(customer().must_change_password).toBe(false);
    expect(outbound.map((o) => o.kind)).toEqual(["whatsapp", "dnd", "email"]);
  });
});
