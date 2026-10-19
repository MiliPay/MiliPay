import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  authPhone,
  channelsFor,
  codeFrom,
  displayPhone,
  normalisePhone,
  validateContactChange,
} from "../supabase/functions/_shared/contact-change";

/**
 * Changing email or phone by a code sent to the NEW address (design handoff,
 * Profile & identity), run for real: the contact-change Edge Function
 * imported, its handler called with real Requests, the database in memory,
 * Resend and Termii stood in for at fetch.
 *
 * The rules that matter: nothing is saved until every code is right; a code
 * goes only to the new address; someone else's number or email cannot be
 * claimed; wrong codes run out; a verified phone becomes the sign-in number.
 */

const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  RESEND_API_KEY: "resend-fixture", // secret-scan: allow — fake fixture, not a credential
  EMAIL_FROM: "MiliPay <codes@milipay.test>",
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  PASSWORD_DELIVERY_CHANNELS: "sms",
};

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let sent: { channel: "email" | "sms"; to: string; code: string }[];
let failSms = false;
let termiiRoutes: string[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/contact-change/index.ts");
  handler = (globalThis as any).__edgeHandler;
  if (typeof handler !== "function") throw new Error("contact-change did not register a handler");
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase({
    customers: [
      { id: "cust-1", auth_user_id: "user-1", status: "active", email: "samuel@example.com", phone: "08012345678" },
      { id: "cust-2", auth_user_id: "user-2", status: "active", email: "taken@example.com", phone: "08099999999" },
    ],
    contact_change_requests: [],
  });
  db.users.set("tok-1", { id: "user-1", email: "samuel@example.com" });
  db.users.set("tok-2", { id: "user-2", email: "taken@example.com" });
  db.rpcAnswers.set("consume_rate_limit", () => true);
  // The customer's PIN is 1234; asking for a change needs it (since 2026-10-20).
  db.rpcAnswers.set("verify_customer_pin", (args: any) =>
    args.p_pin === "1234" ? { valid: true } : { valid: false, code: "PIN_INCORRECT", attemptsRemaining: 4 },
  );
  (globalThis as any).__fakeSupabase = db;

  sent = [];
  termiiRoutes = [];
  failSms = false;
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "https://api.resend.com/emails") {
      sent.push({ channel: "email", to: body.to[0], code: String(body.text).match(/\b(\d{6})\b/)![1] });
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }
    if (url.startsWith("https://api.ng.termii.com/")) {
      if (failSms) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      termiiRoutes.push(body.channel);
      // A voice call reads the code with spaces between the digits.
      const digits = String(body.sms).replace(/(\d) (?=\d)/g, "$1");
      sent.push({ channel: "sms", to: body.to, code: digits.match(/\b(\d{6})\b/)![1] });
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

async function call(body: Record<string, unknown>, token = "tok-1") {
  // Every request carries the right PIN unless a test says otherwise.
  if (body.action === "request" && !("pin" in body)) body = { ...body, pin: "1234" };
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/contact-change", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const customer = () => db.table("customers").find((c) => c.id === "cust-1")!;
const lastCode = (channel: "email" | "sms") => [...sent].reverse().find((s) => s.channel === channel)!.code;

describe("changing email and phone together", () => {
  it("sends a code to each NEW address, asks email then phone, and saves only after both", async () => {
    const started = await call({ action: "request", email: "Samuel.New@Example.com", phone: "0803 123 4567" });
    expect(started.status).toBe(200);
    expect(started.body.steps).toEqual([
      { channel: "email", to: "samuel.new@example.com" },
      { channel: "phone", to: "0803 123 4567" },
    ]);
    // To the new ones, not the ones on file.
    expect(sent.map((s) => [s.channel, s.to])).toEqual([
      ["email", "samuel.new@example.com"],
      ["sms", "2348031234567"],
    ]);

    const id = started.body.requestId;
    const first = await call({ action: "verify", requestId: id, channel: "email", code: lastCode("email") });
    expect(first.body).toMatchObject({ success: true, done: false, next: "phone" });
    // Nothing saved yet.
    expect(customer()).toMatchObject({ email: "samuel@example.com", phone: "08012345678" });
    expect(db.authUpdates).toEqual([]);

    const second = await call({ action: "verify", requestId: id, channel: "phone", code: lastCode("sms") });
    expect(second.body).toMatchObject({ success: true, done: true });
    expect(customer()).toMatchObject({ email: "samuel.new@example.com", phone: "08031234567" });
    // The verified phone is now the sign-in number.
    expect(db.authUpdates).toEqual([
      {
        id: "user-1",
        attributes: { email: "samuel.new@example.com", email_confirm: true, phone: "+2348031234567", phone_confirm: true },
      },
    ]);
  });

  it("stores only a keyed hash of each code, never the code", async () => {
    await call({ action: "request", email: "new@example.com", phone: "08031234567" });
    const row = db.table("contact_change_requests")[0];
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(lastCode("email"));
    expect(stored).not.toContain(lastCode("sms"));
    expect(String(row.email_code_hash)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("wrong codes", () => {
  it("says so in the design's words, and runs out after five", async () => {
    const { body } = await call({ action: "request", phone: "08031234567" });
    const wrong = lastCode("sms") === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      const r = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("That code isn't right. Check it and try again.");
    }
    const fifth = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: wrong });
    expect(fifth.status).toBe(410);
    // Even the right code is refused now.
    const late = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: lastCode("sms") });
    expect(late.status).toBe(410);
    expect(customer().phone).toBe("08012345678");
    expect(db.authUpdates).toEqual([]);
  });

  it("an expired code is refused", async () => {
    const { body } = await call({ action: "request", phone: "08031234567" });
    db.table("contact_change_requests")[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const r = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: lastCode("sms") });
    expect(r.status).toBe(410);
    expect(customer().phone).toBe("08012345678");
  });
});

describe("what cannot happen", () => {
  it("someone else's number or email gets no code", async () => {
    const phone = await call({ action: "request", phone: "08099999999" });
    expect(phone.status).toBe(409);
    const email = await call({ action: "request", email: "TAKEN@example.com" });
    expect(email.status).toBe(409);
    expect(sent).toEqual([]);
  });

  it("a number that is not Nigerian mobile, a bad email, or no change at all", async () => {
    expect((await call({ action: "request", phone: "06012345678" })).body.code).toBe("INVALID_PHONE");
    expect((await call({ action: "request", email: "not-an-email" })).body.code).toBe("INVALID_EMAIL");
    expect((await call({ action: "request", email: "SAMUEL@example.com", phone: "08012345678" })).body.code).toBe("NO_CHANGE");
    expect(sent).toEqual([]);
  });

  it("another customer cannot use your request", async () => {
    const { body } = await call({ action: "request", phone: "08031234567" });
    const r = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: lastCode("sms") }, "tok-2");
    expect(r.status).toBe(404);
    expect(customer().phone).toBe("08012345678");
  });

  it("closing the sheet discards the change", async () => {
    const { body } = await call({ action: "request", phone: "08031234567" });
    await call({ action: "cancel", requestId: body.requestId });
    const r = await call({ action: "verify", requestId: body.requestId, channel: "phone", code: lastCode("sms") });
    expect(r.status).toBe(410);
    expect(customer().phone).toBe("08012345678");
  });

  it("a code that could not be sent is said so, and nothing waits on it", async () => {
    failSms = true;
    const r = await call({ action: "request", phone: "08031234567" });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/couldn't send a code to that number/);
    expect(db.table("contact_change_requests")[0].cancelled_at).toBeTruthy();
  });

  it("when sign-in refuses the new email, the profile is left as it was", async () => {
    db.authUpdateError = "A user with this email address has already been registered";
    const { body } = await call({ action: "request", email: "fresh@example.com" });
    const r = await call({ action: "verify", requestId: body.requestId, channel: "email", code: lastCode("email") });
    expect(r.status).toBe(409);
    expect(customer().email).toBe("samuel@example.com");
  });

  it("needs a signed-in customer", async () => {
    const r = await call({ action: "request", phone: "08031234567" }, "nobody");
    expect(r.status).toBe(401);
  });
});

describe("the rules on their own", () => {
  it("formats and normalises numbers", () => {
    expect(normalisePhone("+234 803 123 4567")).toBe("08031234567");
    expect(authPhone("08031234567")).toBe("+2348031234567");
    expect(displayPhone("08031234567")).toBe("0803 123 4567");
    expect(codeFrom(42)).toBe("000042");
    expect(codeFrom(4_294_967_295)).toMatch(/^\d{6}$/);
  });

  it("ignores a field that did not change", () => {
    const r = validateContactChange({ email: "samuel@example.com", phone: "08031234567" }, { email: "Samuel@Example.com", phone: "08012345678" });
    expect(r).toEqual({ ok: true, change: { email: null, phone: "08031234567" } });
    expect(channelsFor({ email: null, phone: "08031234567" })).toEqual(["phone"]);
  });
});

describe("the PIN, and how the code reaches the new number (2026-10-20)", () => {
  it("asks for the PIN before anything is sent, and a wrong PIN sends nothing", async () => {
    const none = await call({ action: "request", phone: "0803 123 4567", pin: "" });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("PIN_REQUIRED");
    const wrong = await call({ action: "request", phone: "0803 123 4567", pin: "9999" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("PIN_INCORRECT");
    expect(sent).toEqual([]);
    expect(db.table("contact_change_requests")).toEqual([]);
  });

  it("sends the new number's code by SMS by default, or by a voice call when asked", async () => {
    await call({ action: "request", phone: "0803 123 4567" });
    expect(termiiRoutes).toEqual(["dnd"]);
    termiiRoutes = [];
    ENV.TERMII_VOICE = "on";
    await call({ action: "request", phone: "0803 123 4567", phoneVia: "call" });
    expect(termiiRoutes).toEqual(["voice"]);
  });

  it("never sends the phone's code by email, and refuses a way that isn't switched on", async () => {
    const email = await call({ action: "request", phone: "0803 123 4567", phoneVia: "email" });
    expect(email.status).toBe(400);
    expect(email.body.code).toBe("CHANNEL_UNAVAILABLE");
    const whatsapp = await call({ action: "request", phone: "0803 123 4567", phoneVia: "whatsapp" });
    expect(whatsapp.body.code).toBe("CHANNEL_UNAVAILABLE");
    expect(sent).toEqual([]);
  });

  it("marks a changed email as verified, so codes may go there later", async () => {
    const started = await call({ action: "request", email: "samuel.new@example.com" });
    await call({ action: "verify", requestId: started.body.requestId, channel: "email", code: lastCode("email") });
    expect(customer().email).toBe("samuel.new@example.com");
    expect(customer().email_verified_at).toBeTruthy();
  });
});
