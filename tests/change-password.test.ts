import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";

/**
 * Me › Security › Change password and "Forgot your current password?"
 * (design handoff, screen 9b), run for real: the password Edge Function
 * imported, the database in memory, Supabase Auth's password check and Termii
 * stood in for at fetch.
 *
 * What matters: a wrong current password changes nothing; a reset code goes
 * only to the number on the account; a reset token works once; and every
 * other session is signed out after any change.
 */

const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  PASSWORD_DELIVERY_CHANNELS: "sms",
};
const CURRENT = "oldpass123";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let sms: { to: string; code: string }[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/password/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase({
    customers: [{ id: "cust-1", auth_user_id: "user-1", phone: "08031234567", must_change_password: false }],
    password_resets: [],
  });
  db.users.set("tok-1", { id: "user-1", email: "08031234567@customer.milipay.ng" });
  db.rpcAnswers.set("consume_rate_limit", () => true);
  (globalThis as any).__fakeSupabase = db;
  sms = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("/auth/v1/token?grant_type=password")) {
      return body.password === CURRENT
        ? new Response(JSON.stringify({ access_token: "x" }), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    if (url.startsWith("https://api.ng.termii.com/")) {
      sms.push({ to: body.to, code: String(body.sms).match(/\b(\d{6})\b/)![1] });
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function call(body: Record<string, unknown>) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/password", {
      method: "POST",
      headers: { Authorization: "Bearer tok-1", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe("changing the password", () => {
  it("a wrong current password changes nothing", async () => {
    const res = await call({ action: "change", current: "nope", password: "newpass123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("That's not your current password.");
    expect(db.authUpdates).toEqual([]);
    expect(db.signOuts).toEqual([]);
  });

  it("the right one changes it, records it and signs out every other session", async () => {
    const res = await call({ action: "change", current: CURRENT, password: "newpass123" });
    expect(res.status).toBe(200);
    expect(db.authUpdates).toEqual([{ id: "user-1", attributes: { password: "newpass123" } }]);
    expect(db.table("customers")[0].password_changed_at).toBeTruthy();
    expect(db.signOuts).toEqual([{ jwt: "tok-1", scope: "others" }]);
  });

  it("the design's rules are enforced on the server too", async () => {
    expect((await call({ action: "change", current: CURRENT, password: "short1" })).body.code).toBe("WEAK_PASSWORD");
    expect((await call({ action: "change", current: CURRENT, password: "nonumbers" })).body.code).toBe("WEAK_PASSWORD");
    expect((await call({ action: "change", current: CURRENT, password: CURRENT })).body.code).toBe("SAME_PASSWORD");
  });
});

describe("forgot the current password", () => {
  it("a code goes only to the number on the account", async () => {
    const other = await call({ action: "reset_request", phone: "0809 999 9999" });
    expect(other.status).toBe(400);
    expect(other.body.error).toBe("That's not the number on your account.");
    expect((await call({ action: "reset_request", phone: "12" })).body.error).toBe("Enter the 10 digits after +234.");
    expect(sms).toEqual([]);
  });

  it("phone, code, new password — and the reset token works once", async () => {
    const started = await call({ action: "reset_request", phone: "803 123 4567" });
    expect(started.body).toMatchObject({ success: true, sentTo: "+234 803 123 4567" });
    expect(sms[0].to).toBe("2348031234567");

    const wrong = String((Number(sms[0].code) + 1) % 1_000_000).padStart(6, "0");
    const bad = await call({ action: "reset_verify", requestId: started.body.requestId, code: wrong });
    expect(bad.body.error).toBe("That code isn't right. Check the SMS and try again.");

    const ok = await call({ action: "reset_verify", requestId: started.body.requestId, code: sms[0].code });
    const resetToken = ok.body.resetToken;
    expect(resetToken).toMatch(/^[0-9a-f]{64}$/);

    // No current password needed now.
    const done = await call({ action: "reset", requestId: started.body.requestId, resetToken, password: "brandnew99" });
    expect(done.status).toBe(200);
    expect(db.authUpdates).toEqual([{ id: "user-1", attributes: { password: "brandnew99" } }]);
    expect(db.signOuts).toEqual([{ jwt: "tok-1", scope: "others" }]);

    const again = await call({ action: "reset", requestId: started.body.requestId, resetToken, password: "another99" });
    expect(again.status).toBe(410);
    expect(db.authUpdates).toHaveLength(1);
  });

  it("a made-up reset token gets nowhere", async () => {
    const started = await call({ action: "reset_request", phone: "08031234567" });
    await call({ action: "reset_verify", requestId: started.body.requestId, code: sms[0].code });
    const res = await call({ action: "reset", requestId: started.body.requestId, resetToken: "f".repeat(64), password: "brandnew99" });
    expect(res.status).toBe(410);
    expect(db.authUpdates).toEqual([]);
  });
});
