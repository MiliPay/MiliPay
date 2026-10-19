import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  codeClosed,
  loginPhone,
  pinRefusal,
  sentTo,
  signInRefusal,
  verifiedNotice,
} from "../supabase/functions/_shared/login-code";

/**
 * Signing in with an SMS code (redesign phase 6), run for real: the
 * login-code Edge Function imported, its handler called with real Requests,
 * the database in memory, Termii stood in for at fetch.
 *
 * The rules that matter: only a verified customer gets a code; the code is
 * never stored; wrong codes run out; a code works once; and an account that
 * is already set up needs its PIN as well, so a code alone (a swapped SIM)
 * never gets in.
 */

const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  PASSWORD_DELIVERY_CHANNELS: "whatsapp,sms",
};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let sent: { channel: string; to: string; code: string }[];
let failSms = false;
let rateLimitAnswer: () => unknown;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/login-code/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("login-code did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase({
    customers: [
      // First sign-in: approved, nothing set up yet.
      { id: "cust-new", auth_user_id: "user-new", status: "active", phone: "08012345678", pin_hash: null, onboarding_completed_at: null },
      // Already set up: PIN and onboarding done.
      { id: "cust-old", auth_user_id: "user-old", status: "active", phone: "08099999999", pin_hash: "$2a$hash", onboarding_completed_at: "2026-09-20T10:00:00Z" },
      { id: "cust-pending", auth_user_id: null, status: "pending", phone: "08055555555" },
      { id: "cust-susp", auth_user_id: "user-susp", status: "suspended", phone: "08066666666" },
    ],
    login_codes: [],
  });
  db.authUsers.set("user-new", { id: "user-new", email: "ada@example.com" });
  db.authUsers.set("user-old", { id: "user-old", email: "tunde@example.com" });
  rateLimitAnswer = () => true;
  db.rpcAnswers.set("consume_rate_limit", () => rateLimitAnswer());
  (globalThis as any).__fakeSupabase = db;

  sent = [];
  failSms = false;
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.startsWith("https://api.ng.termii.com/")) {
      if (failSms) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      sent.push({ channel: body.channel, to: body.to, code: String(body.sms).match(/\b(\d{6})\b/)![1] });
      return new Response(JSON.stringify({ message_id: "sms_1" }), { status: 200 });
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

async function call(body: Record<string, unknown>) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const lastCode = () => sent[sent.length - 1].code;
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe("first sign-in", () => {
  it("texts a code to a verified customer and signs them in with it", async () => {
    const started = await call({ action: "request", phone: "0801 234 5678" });
    expect(started.status).toBe(200);
    expect(started.body.sentTo).toBe("+234 801 234 5678");
    // By SMS, as the screen says — not WhatsApp, even when WhatsApp is configured first.
    expect(sent.map((s) => [s.channel, s.to])).toEqual([["dnd", "2348012345678"]]);

    const done = await call({ action: "verify", requestId: started.body.requestId, code: lastCode() });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ success: true, step: "session" });
    expect(done.body.tokenHash).toBe(db.generatedLinks[0].token);
    // A token for this customer's own identity, and nothing emailed.
    expect(db.generatedLinks).toEqual([expect.objectContaining({ type: "magiclink", email: "ada@example.com" })]);
  });

  it("never stores the code itself", async () => {
    const started = await call({ action: "request", phone: "08012345678" });
    const row = db.table("login_codes").find((r) => r.id === started.body.requestId)!;
    expect(JSON.stringify(row)).not.toContain(lastCode());
    expect(String(row.code_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a code works once", async () => {
    const started = await call({ action: "request", phone: "08012345678" });
    const code = lastCode();
    expect((await call({ action: "verify", requestId: started.body.requestId, code })).status).toBe(200);
    const again = await call({ action: "verify", requestId: started.body.requestId, code });
    expect(again.status).toBe(410);
    expect(db.generatedLinks).toHaveLength(1);
  });

  it("asking again replaces the last code", async () => {
    const first = await call({ action: "request", phone: "08012345678" });
    const firstCode = lastCode();
    await call({ action: "request", phone: "08012345678" });
    const stale = await call({ action: "verify", requestId: first.body.requestId, code: firstCode });
    expect(stale.status).toBe(410);
  });
});

describe("who gets a code", () => {
  it("not an unknown or still-pending number, and no SMS is sent", async () => {
    for (const phone of ["08077777777", "08055555555"]) {
      const res = await call({ action: "request", phone });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_VERIFIED");
      expect(res.body.error).toMatch(/still be being checked/);
    }
    expect(sent).toEqual([]);
  });

  it("not a suspended account", async () => {
    const res = await call({ action: "request", phone: "08066666666" });
    expect(res.status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("not a malformed number", async () => {
    const res = await call({ action: "request", phone: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Enter the 11-digit number you registered with.");
  });

  it("says so when the SMS could not be sent, and the code is dropped", async () => {
    failSms = true;
    const res = await call({ action: "request", phone: "08012345678" });
    expect(res.status).toBe(503);
    expect(db.table("login_codes")[0].cancelled_at).toBeTruthy();
  });

  it("is rate limited, and refuses when the limiter itself is down", async () => {
    rateLimitAnswer = () => false;
    expect((await call({ action: "request", phone: "08012345678" })).status).toBe(429);
    db.rpcAnswers.set("consume_rate_limit", () => {
      throw new Error("db down");
    });
    // A thrown rpc reaches the handler as an error response, never an SMS.
    const res = await call({ action: "request", phone: "08012345678" }).catch(() => ({ status: 500 }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(sent).toEqual([]);
  });
});

describe("wrong codes", () => {
  it("run out after 5, and the right one no longer works", async () => {
    const started = await call({ action: "request", phone: "08012345678" });
    const code = lastCode();
    for (let i = 1; i <= 4; i++) {
      const res = await call({ action: "verify", requestId: started.body.requestId, code: wrong(code) });
      expect(res.status).toBe(400);
      expect(res.body.attemptsLeft).toBe(5 - i);
    }
    expect((await call({ action: "verify", requestId: started.body.requestId, code: wrong(code) })).status).toBe(410);
    expect((await call({ action: "verify", requestId: started.body.requestId, code })).status).toBe(410);
    expect(db.generatedLinks).toEqual([]);
  });

  it("a new code can't be asked for within 30 seconds", async () => {
    const started = await call({ action: "request", phone: "08012345678" });
    const res = await call({ action: "resend", requestId: started.body.requestId });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RESEND_TOO_SOON");
  });
});

describe("an account that is already set up", () => {
  it("needs the PIN after the code; the code alone signs nobody in", async () => {
    const started = await call({ action: "request", phone: "08099999999" });
    const res = await call({ action: "verify", requestId: started.body.requestId, code: lastCode() });
    expect(res.body).toEqual({ success: true, step: "pin" });
    expect(db.generatedLinks).toEqual([]);
  });

  it("a wrong PIN is refused with the tries left; the right one signs in", async () => {
    let tries = 2;
    db.rpcAnswers.set("verify_customer_pin", (args: any) =>
      args.p_pin === "4321" ? { valid: true } : { valid: false, code: "PIN_INCORRECT", attemptsRemaining: tries-- },
    );
    const started = await call({ action: "request", phone: "08099999999" });
    await call({ action: "verify", requestId: started.body.requestId, code: lastCode() });

    const bad = await call({ action: "pin", requestId: started.body.requestId, pin: "1111" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("That PIN isn't right. 2 tries left.");

    const good = await call({ action: "pin", requestId: started.body.requestId, pin: "4321" });
    expect(good.body).toMatchObject({ success: true, step: "session" });
    expect(db.generatedLinks[0].email).toBe("tunde@example.com");
    // Checked against this customer, by the server's own PIN rule.
    expect(db.rpcCalls.filter((c) => c.name === "verify_customer_pin").map((c) => (c.args as any).p_user_id)).toEqual([
      "user-old",
      "user-old",
    ]);
  });

  it("the PIN step can't be reached without the right code", async () => {
    db.rpcAnswers.set("verify_customer_pin", () => ({ valid: true }));
    const started = await call({ action: "request", phone: "08099999999" });
    const res = await call({ action: "pin", requestId: started.body.requestId, pin: "4321" });
    expect(res.status).toBe(410);
    expect(db.rpcCalls.some((c) => c.name === "verify_customer_pin")).toBe(false);
    expect(db.generatedLinks).toEqual([]);
  });

  it("a locked PIN ends this sign-in", async () => {
    db.rpcAnswers.set("verify_customer_pin", () => ({ valid: false, code: "PIN_LOCKED" }));
    const started = await call({ action: "request", phone: "08099999999" });
    await call({ action: "verify", requestId: started.body.requestId, code: lastCode() });
    const res = await call({ action: "pin", requestId: started.body.requestId, pin: "1111" });
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked for 15 minutes/);
    expect(db.table("login_codes")[0].cancelled_at).toBeTruthy();
  });
});

describe("the rules", () => {
  it("phone forms", () => {
    expect(loginPhone("+234 803 123 4567")).toBe("08031234567");
    expect(loginPhone("2348031234567")).toBe("08031234567");
    expect(loginPhone("8031234567")).toBe("08031234567");
    expect(loginPhone("0803 123 4567")).toBe("08031234567");
    expect(loginPhone("0603 123 4567")).toBeNull();
    expect(loginPhone(42)).toBeNull();
    expect(sentTo("08031234567")).toBe("+234 803 123 4567");
  });

  it("who may sign in", () => {
    expect(signInRefusal(null)?.code).toBe("NOT_VERIFIED");
    expect(signInRefusal({ status: "pending", auth_user_id: null })?.code).toBe("NOT_VERIFIED");
    expect(signInRefusal({ status: "active", auth_user_id: null })?.code).toBe("NOT_VERIFIED");
    expect(signInRefusal({ status: "rejected", auth_user_id: "u" })?.code).toBe("ACCOUNT_NOT_ACTIVE");
    expect(signInRefusal({ status: "active", auth_user_id: "u" })).toBeNull();
  });

  it("closed codes", () => {
    const base = { expires_at: "2026-10-01T12:10:00Z", attempts: 0, needs_pin: false, code_verified_at: null, consumed_at: null, cancelled_at: null };
    const now = new Date("2026-10-01T12:00:00Z");
    expect(codeClosed(base, now)).toBeNull();
    expect(codeClosed({ ...base, consumed_at: "x" }, now)).toMatch(/already been used/);
    expect(codeClosed({ ...base, attempts: 5 }, now)).toMatch(/Too many/);
    expect(codeClosed(base, new Date("2026-10-01T12:10:00Z"))).toMatch(/expired/);
  });

  it("PIN refusals and the verified message", () => {
    expect(pinRefusal({ code: "PIN_INCORRECT", attemptsRemaining: 1 })).toBe("That PIN isn't right. 1 try left.");
    expect(pinRefusal({ code: "PIN_LOCKED" })).toMatch(/15 minutes/);
    const notice = verifiedNotice("Ada");
    expect(notice).toMatch(/^Hello Ada, your MiliPay account is verified/);
    // No secret travels in it.
    expect(notice).not.toMatch(/password/i);
    expect(notice).not.toMatch(/\d{4,}/);
  });
});

describe("choosing how the code comes (2026-10-20)", () => {
  let emails: { to: string; code: string }[];
  beforeEach(() => {
    ENV.RESEND_API_KEY = "resend-fixture"; // secret-scan: allow — fake fixture, not a credential
    ENV.EMAIL_FROM = "MiliPay <codes@milipay.test>";
    emails = [];
    const termii = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://api.resend.com/emails") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        emails.push({ to: body.to[0], code: String(body.text).match(/\b(\d{6})\b/)![1] });
        return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
      }
      return termii(input, init);
    }) as typeof fetch;
  });

  it("lists the ways a code can come, email never for proving a phone", async () => {
    const res = await call({ action: "channels" });
    expect(res.body.channels.sign_in).toEqual(["sms", "email"]);
    expect(res.body.channels.prove_phone).toEqual(["sms"]);
    ENV.TERMII_VOICE = "on";
    expect((await call({ action: "channels" })).body.channels.prove_phone).toEqual(["sms", "call"]);
  });

  it("emails the code only to a verified email, and answers the same either way", async () => {
    // cust-new has no verified email: nothing is sent, and nothing says so.
    const none = await call({ action: "request", phone: "08012345678", channel: "email" });
    expect(none.status).toBe(200);
    expect(none.body.sentTo).toBe("your verified email, if this account has one");
    expect(emails).toEqual([]);

    const c = db.table("customers").find((x) => x.id === "cust-new")!;
    c.email = "ada@example.com";
    c.email_verified_at = "2026-10-01T10:00:00Z";
    const some = await call({ action: "request", phone: "08012345678", channel: "email" });
    expect(some.body.sentTo).toBe(none.body.sentTo);
    expect(emails.map((e) => e.to)).toEqual(["ada@example.com"]);
    const done = await call({ action: "verify", requestId: some.body.requestId, code: emails[0].code });
    expect(done.body.step).toBe("session");
  });

  it("an unverified email gets nothing, even if one is on file", async () => {
    const c = db.table("customers").find((x) => x.id === "cust-new")!;
    c.email = "ada@example.com";
    await call({ action: "request", phone: "08012345678", channel: "email" });
    expect(emails).toEqual([]);
  });

  it("calls with the code read out when asked, and refuses a way that isn't on", async () => {
    expect((await call({ action: "request", phone: "08012345678", channel: "call" })).body.code).toBe("CHANNEL_UNAVAILABLE");
    ENV.TERMII_VOICE = "on";
    sent = [];
    const fetchBefore = globalThis.fetch;
    const routes: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("https://api.ng.termii.com/")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        routes.push(body.channel);
        expect(String(body.sms)).toMatch(/code is (\d ){5}\d\. Again/);
        return new Response(JSON.stringify({ message_id: "v_1" }), { status: 200 });
      }
      return fetchBefore(input, init);
    }) as typeof fetch;
    const res = await call({ action: "request", phone: "08012345678", channel: "call" });
    expect(res.status).toBe(200);
    expect(routes).toEqual(["voice"]);
  });

  it("a resend can switch to another way", async () => {
    const started = await call({ action: "request", phone: "08012345678" });
    const c = db.table("customers").find((x) => x.id === "cust-new")!;
    c.email = "ada@example.com";
    c.email_verified_at = "2026-10-01T10:00:00Z";
    db.table("login_codes")[0].sent_at = new Date(Date.now() - 60_000).toISOString();
    const again = await call({ action: "resend", requestId: started.body.requestId, channel: "email" });
    expect(again.status).toBe(200);
    expect(emails).toHaveLength(1);
  });
});
