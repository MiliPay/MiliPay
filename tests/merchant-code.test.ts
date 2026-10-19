import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";

/**
 * The merchant portal's second step (agreed 2026-10-20), run for real: the
 * merchant-code function's handler, the database in memory, Termii and
 * Resend stood in for at fetch. A code is bound to one sign-in session; the
 * database hides the merchant's data until that session passes.
 */

const ENV: Record<string, string | undefined> = {};
let handler: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sent: { to: string; text: string; route: string }[];
const realFetch = globalThis.fetch;
const M = "11111111-1111-4111-8111-111111111111";

/** A bearer token whose claims carry a session id, as Supabase's do. */
const tokenFor = (session: string) => `h.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.s`;
const S1 = tokenFor("session-1");
const S2 = tokenFor("session-2");

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
  await import("../supabase/functions/merchant-code/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

beforeEach(() => {
  for (const k of Object.keys(ENV)) delete ENV[k];
  Object.assign(ENV, {
    SUPABASE_URL: "https://project.supabase.test",
    SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
    SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
    TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
    RESEND_API_KEY: "resend-fixture", // secret-scan: allow — fake fixture, not a credential
    EMAIL_FROM: "MiliPay <codes@milipay.test>",
    PASSWORD_DELIVERY_CHANNELS: "sms",
  });
  db = new FakeSupabase({
    merchants: [{ id: M, auth_user_id: "merchant-user", director_phone: "08031234567", email: "owner@lekkifresh.ng" }],
    merchant_sign_in_codes: [],
  });
  db.users.set(S1, { id: "merchant-user", email: "owner@lekkifresh.ng" });
  db.users.set(S2, { id: "merchant-user", email: "owner@lekkifresh.ng" });
  db.users.set(tokenFor("staff-session"), { id: "staff-user", email: "admin@milipay.ng" });
  db.rpcAnswers.set("consume_rate_limit", () => true);
  (globalThis as any).__fakeSupabase = db;
  sent = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (String(input) === "https://api.resend.com/emails") {
      sent.push({ to: body.to[0], text: body.text, route: "email" });
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    }
    sent.push({ to: body.to, text: String(body.sms), route: body.channel });
    return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function call(body: Record<string, unknown>, token = S1) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/merchant-code", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const lastCode = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];

describe("merchant sign-in code", () => {
  it("is required for a merchant, offers SMS or email, and passes this session only", async () => {
    const before = await call({ action: "status" });
    expect(before.body).toMatchObject({ required: true, passed: false, phone: "+234 ••• ••• 4567", email: "o•••@lekkifresh.ng" });
    expect(before.body.channels).toEqual(["sms", "email"]);

    const asked = await call({ action: "request", channel: "sms" });
    expect(asked.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ to: "2348031234567", route: "dnd" });
    expect(JSON.stringify(db.table("merchant_sign_in_codes"))).not.toContain(lastCode());

    // Another session can't use this session's code.
    expect((await call({ action: "verify", requestId: asked.body.requestId, code: lastCode() }, S2)).status).toBe(404);
    expect((await call({ action: "verify", requestId: asked.body.requestId, code: lastCode() })).body.passed).toBe(true);
    expect((await call({ action: "status" })).body.passed).toBe(true);
    expect((await call({ action: "status" }, S2)).body.passed).toBe(false);
  });

  it("emails the code to the sign-in email when asked", async () => {
    await call({ action: "request", channel: "email" });
    expect(sent.at(-1)).toMatchObject({ to: "owner@lekkifresh.ng", route: "email" });
  });

  it("wrong codes run out, and a used or closed code does nothing", async () => {
    const asked = await call({ action: "request" });
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect((await call({ action: "verify", requestId: asked.body.requestId, code: wrong })).body.code).toBe("CODE_INCORRECT");
    expect((await call({ action: "verify", requestId: asked.body.requestId, code: wrong })).body.code).toBe("CODE_CLOSED");
    expect((await call({ action: "verify", requestId: asked.body.requestId, code: right })).body.code).toBe("CODE_CLOSED");
    expect((await call({ action: "status" })).body.passed).toBe(false);
  });

  it("refuses a way that isn't on, and isn't asked of someone who isn't a merchant", async () => {
    expect((await call({ action: "request", channel: "call" })).body.code).toBe("CHANNEL_UNAVAILABLE");
    expect((await call({ action: "status" }, tokenFor("staff-session"))).body).toMatchObject({ required: false, passed: true });
  });
});

describe("the database enforces it", () => {
  const SQL = readFileSync(join(__dirname, "..", "supabase/migrations/20261020110000_merchant_second_step.sql"), "utf8");

  it("hides merchants, transactions and terminals from a merchant session that hasn't passed", () => {
    for (const table of ["merchants", "transactions", "pos_terminals"]) {
      expect(SQL).toMatch(new RegExp(`ON public\\.${table} AS RESTRICTIVE FOR SELECT TO authenticated\\s+USING \\(\\(SELECT public\\.merchant_second_step_ok\\(\\)\\)\\)`));
    }
    expect(SQL).toMatch(/c\.session_id = coalesce\(auth\.jwt\(\) ->> 'session_id', ''\)\s+AND c\.verified_at IS NOT NULL/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.merchant_sign_in_codes FROM PUBLIC, anon, authenticated;/);
  });
});
