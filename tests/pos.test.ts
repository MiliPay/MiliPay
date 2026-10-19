import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { afterWrongPin, daySummary, initials, MAX_PIN_ATTEMPTS, posOutcome, posStatus } from "../supabase/functions/_shared/pos";

/**
 * The POS terminal app's backend (merchant-portal/design_handoff_pos): first
 * login with the merchant's phone and password, cashier PINs, palm payments
 * through the shared checkout, history, end of day, supervisor refunds.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("terminal rules", () => {
  it("every checkout error lands on one of the design's result screens", () => {
    expect(posOutcome("PIN_REQUIRED")).toBe("pin");
    expect(posOutcome("PIN_INCORRECT")).toBe("pin-wrong");
    expect(posOutcome("PALM_PAUSED")).toBe("paused");
    expect(posOutcome("PALM_MATCH_AMBIGUOUS")).toBe("not-recognised");
    expect(posOutcome("EXCEEDS_DAILY_LIMIT")).toBe("limit");
    // Anything else means "couldn't check": no money moved.
    expect(posOutcome("BIOMETRIC_SERVICE_UNAVAILABLE")).toBe("unavailable");
    expect(posOutcome(undefined)).toBe("unavailable");
  });

  it("a cashier is locked after five wrong PINs", () => {
    const now = new Date("2026-10-16T10:00:00Z");
    expect(afterWrongPin(0, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
    const locked = afterWrongPin(MAX_PIN_ATTEMPTS - 1, now);
    expect(locked.failedAttempts).toBe(0);
    expect(locked.lockedUntil).toBe("2026-10-16T10:15:00.000Z");
  });

  it("end of day: refund requests leave the totals; sums are to the kobo", () => {
    const s = daySummary([
      { amount: 4500, fee: 67.5, method: "palm", status: "delivered" },
      { amount: 2300, fee: 34.5, method: "qr", status: "delivered" },
      { amount: 31000, fee: 465, method: "palm", status: "refund_pending" },
      { amount: 999, fee: 0, method: "palm", status: "payment_failed" },
    ]);
    expect(s).toMatchObject({ count: 2, gross: 6800, refunds: 31000, fees: 102, net: 6698, palmShare: 0.5 });
    expect(s.mix.map((m) => [m.method, m.count])).toEqual([["palm", 1], ["qr", 1], ["card", 0]]);
    expect(initials("Tunde Adebayo")).toBe("TA");
    expect(posStatus("refund_pending")).toBe("Refund requested");
  });

  it("the tables are the function's alone, and both checkouts are one", () => {
    const sql = read("supabase/migrations/20261016090000_pos_terminal.sql");
    for (const t of ["pos_cashiers", "pos_refunds"]) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated;`);
      expect(sql).toContain(`GRANT ALL ON public.${t} TO service_role;`);
    }
    expect(read("supabase/functions/process-payment/index.ts")).toMatch(/return palmCheckout\(admin,/);
    expect(read("supabase/functions/pos/index.ts")).toMatch(/await palmCheckout\(admin,/);
  });
});

// ── pos function, run for real ────────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let pos: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sent: string[];
let matcher: Record<string, unknown>;

const SECRET = "svc-role-fixture"; // secret-scan: allow — fake fixture, not a credential
const M = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const GRACE = "44444444-4444-4444-8444-444444444444";
const pinHash = (id: string, pin: string) => createHmac("sha256", SECRET).update(`pos-cashier-pin:${id}:${pin}`).digest("hex");

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/pos/index.ts");
  pos = (globalThis as any).__edgeHandler;
});

async function call(path: string, opts: { body?: unknown; token?: string; session?: string; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" };
  if (opts.token) headers["x-terminal-token"] = opts.token;
  if (opts.session) headers["x-cashier-session"] = opts.session;
  const res = await pos(
    new Request(`https://project.supabase.test/functions/v1/pos${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const LOGIN = { phone: "803 123 4567", password: "secret-pass", serial: "MP-P5-00921" };

/** First login, then the owner's PIN: a signed-in terminal with the owner on shift. */
async function onShift() {
  const login = await call("/login", { body: LOGIN });
  const set = await call("/set-pin", { token: login.body.token, body: { setupGrant: login.body.setupGrant, pin: "1234" } });
  return { token: login.body.token as string, session: set.body.session as string, ownerId: login.body.owner.id as string };
}

describe("pos function", () => {
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: SECRET,
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      PALM_MATCH_URL: "https://matcher.test/match",
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
      PASSWORD_DELIVERY_CHANNELS: "sms",
    });
    db = new FakeSupabase({
      merchants: [{
        id: M, business_name: "Lekki Fresh Mart", address: "Lekki Phase 1, Lagos", status: "active", platform_fee_percent: 1.5,
        settlement_schedule: "instant", settlement_bank_name: "GTBank", settlement_account_number: "0123454410",
        director_name: "Tunde Adebayo", director_phone: "08031234567", email: "owner@lekkifresh.ng",
      }],
      // Already paired with this merchant; a new terminal is tested below.
      pos_terminals: [{ id: T, terminal_id: "TRM-2041", merchant_id: M, device_serial_number: "MP-P5-00921", is_active: true, terminal_api_key_hash: null, sms_receipts: true, paired_merchant_id: M }],
      pos_pairing_codes: [],
      pos_cashiers: [],
      pos_refunds: [],
      transactions: [],
      palm_match_events: [],
      customers: [{
        id: C, auth_user_id: "auth-cust", first_name: "Adaeze", last_name: "Okafor", phone: "08059998888", status: "active",
        kyc_tier: 2, pin_threshold: 10000, single_limit: null, daily_limit: null, palm_paused: false, email: null,
      }],
    });
    db.passwords.set("owner@lekkifresh.ng", "secret-pass");
    db.rpcAnswers.set("consume_rate_limit", () => true);
    db.rpcAnswers.set("tier_caps", () => [{ max_single: 150000, max_daily: 500000 }]);
    db.rpcAnswers.set("get_customer_daily_spend", () => 0);
    db.rpcAnswers.set("palm_account_for", () => null);
    db.rpcAnswers.set("verify_customer_pin", (args: any) =>
      args.p_pin === "4321" ? { valid: true } : { valid: false, code: "PIN_INCORRECT", attemptsRemaining: 2 });
    (globalThis as any).__fakeSupabase = db;
    sent = [];
    matcher = { matched: true, customerId: C, authUserId: "auth-cust", score: 0.99, runnerUpScore: null, threshold: 0.9 };
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://matcher.test")) return new Response(JSON.stringify(matcher), { status: 200 });
      sent.push(String(JSON.parse(String(init?.body ?? "{}")).sms ?? ""));
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("first login: the design's words for a wrong password, and only a registered terminal pairs", async () => {
    const wrong = await call("/login", { body: { ...LOGIN, password: "nope" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("That phone number and password don't match.");
    expect((await call("/login", { body: { ...LOGIN, phone: "12" } })).body.error).toBe("Enter the 10 digits after +234.");
    const stranger = await call("/login", { body: { ...LOGIN, serial: "SOMEONE-ELSE" } });
    expect(stranger.body.code).toBe("TERMINAL_NOT_REGISTERED");

    const ok = await call("/login", { body: LOGIN });
    expect(ok.status).toBe(200);
    expect(ok.body.owner.name).toBe("Tunde");
    // The device token is stored hashed, never as given.
    expect(db.table("pos_terminals")[0].terminal_api_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ok.body.token).not.toContain(db.table("pos_terminals")[0].terminal_api_key_hash);
    expect(db.table("pos_cashiers")).toHaveLength(1);
    expect(db.table("pos_cashiers")[0]).toMatchObject({ is_owner: true, is_supervisor: true });
  });

  it("the owner sets a PIN once; cashiers unlock with theirs and are locked after five wrong tries", async () => {
    const { token, ownerId } = await onShift();
    const me = await call("/me", { token });
    expect(me.body.merchant).toMatchObject({ name: "Lekki Fresh Mart", bank: "GTBank ••4410" });
    expect(me.body.cashiers[0]).toMatchObject({ name: "Tunde", supervisor: true, hasPin: true });

    expect((await call("/unlock", { token, body: { cashierId: ownerId, pin: "1234" } })).status).toBe(200);
    for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i++) {
      expect((await call("/unlock", { token, body: { cashierId: ownerId, pin: "0000" } })).body.error).toBe("Wrong PIN");
    }
    expect((await call("/unlock", { token, body: { cashierId: ownerId, pin: "0000" } })).body.code).toBe("CASHIER_PIN_LOCKED");
    // Locked: even the right PIN waits.
    expect((await call("/unlock", { token, body: { cashierId: ownerId, pin: "1234" } })).status).toBe(423);
  });

  it("nothing works without the device token and a cashier on shift", async () => {
    expect((await call("/me", { token: `${T}:forged` })).status).toBe(401);
    const { token } = await onShift();
    expect((await call("/pay/palm", { token, body: { amount: 4500, irFeatures: "x" } })).body.code).toBe("CASHIER_LOCKED");
  });

  it("a palm payment records the cashier, the method and the terminal", async () => {
    const { token, session, ownerId } = await onShift();
    const res = await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir", rgbFeatures: "rgb", phoneLast4: "8888" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "APPROVED", platformFee: 67.5, netMerchantPayout: 4432.5, customerFirstName: "Adaeze" });
    expect(db.table("transactions")[0]).toMatchObject({ terminal_id: "TRM-2041", cashier_id: ownerId, payment_method: "palm", used_pin: false, status: "delivered" });
  });

  it("above the customer's palm-only limit: their first name and a PIN; a wrong one, then the right one", async () => {
    const { token, session } = await onShift();
    const ask = await call("/pay/palm", { token, session, body: { amount: 25000, irFeatures: "ir" } });
    expect(ask.status).toBe(401);
    expect(ask.body).toMatchObject({ code: "PIN_REQUIRED", outcome: "pin", firstName: "Adaeze", threshold: 10000 });
    expect((await call("/pay/palm", { token, session, body: { amount: 25000, irFeatures: "ir", pin: "0000" } })).body.outcome).toBe("pin-wrong");
    const ok = await call("/pay/palm", { token, session, body: { amount: 25000, irFeatures: "ir", pin: "4321" } });
    expect(ok.body.status).toBe("APPROVED");
    expect(db.table("transactions")[0].used_pin).toBe(true);
  });

  it("declines map to result screens", async () => {
    const { token, session } = await onShift();
    db.table("customers")[0].palm_paused = true;
    expect((await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir" } })).body.outcome).toBe("paused");
    matcher = { matched: false };
    expect((await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir" } })).body.outcome).toBe("not-recognised");
    expect((await call("/pay/qr", { token, session, body: { amount: 4500 } })).status).toBe(501);
    expect(db.table("transactions")).toHaveLength(0);
  });

  it("history names the customer by first name and initial; end of day adds up", async () => {
    const { token, session } = await onShift();
    await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir" } });
    const list = await call("/transactions", { token, session });
    expect(list.body.transactions[0]).toMatchObject({ customer: "Adaeze O.", cashier: "Tunde", method: "palm", status: "Paid", refundable: true });
    const sum = await call("/summary", { token, session });
    expect(sum.body).toMatchObject({ count: 1, gross: 4500, fees: 67.5, net: 4432.5, bank: "GTBank ••4410" });
  });

  it("a refund needs a supervisor's PIN, and is a request, once", async () => {
    const { token, session, ownerId } = await onShift();
    await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir" } });
    const ref = db.table("transactions")[0].reference;
    db.table("pos_cashiers").push({ id: GRACE, merchant_id: M, name: "Grace", is_supervisor: false, is_owner: false, active: true, pin_hash: pinHash(GRACE, "2580"), failed_attempts: 0, locked_until: null });

    expect((await call("/refund", { token, session, body: { reference: ref, supervisorId: GRACE, supervisorPin: "2580" } })).body.code).toBe("NOT_SUPERVISOR");
    expect((await call("/refund", { token, session, body: { reference: ref, supervisorId: ownerId, supervisorPin: "9999" } })).status).toBe(401);
    const ok = await call("/refund", { token, session, body: { reference: ref, supervisorId: ownerId, supervisorPin: "1234" } });
    expect(ok.body.status).toBe("Refund requested");
    expect(db.table("transactions")[0].status).toBe("refund_pending");
    expect(db.table("pos_refunds")[0]).toMatchObject({ amount: 4500, approved_by: ownerId });
    expect((await call("/refund", { token, session, body: { reference: ref, supervisorId: ownerId, supervisorPin: "1234" } })).status).toBe(409);
  });

  it("texts the customer a receipt, and respects the terminal's switch", async () => {
    const { token, session } = await onShift();
    await call("/pay/palm", { token, session, body: { amount: 4500, irFeatures: "ir" } });
    const ref = db.table("transactions")[0].reference;
    expect((await call("/receipt/sms", { token, session, body: { reference: ref } })).status).toBe(200);
    expect(sent[0]).toMatch(/^MiliPay receipt: you paid ₦4,500\.00 at Lekki Fresh Mart\./);
    await call("/settings", { token, session, body: { smsReceipts: false } });
    expect((await call("/receipt/sms", { token, session, body: { reference: ref } })).body.code).toBe("SMS_OFF");
  });

  describe("a terminal not yet paired with this merchant (2026-10-20)", () => {
    const fresh = () => {
      db.table("pos_terminals")[0].paired_merchant_id = null;
    };
    const codeFrom = (text: string) => text.match(/(\d{6})/)![1];

    it("the password alone isn't enough: a code goes to the merchant's phone, then it pairs", async () => {
      fresh();
      const first = await call("/login", { body: LOGIN });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ step: "code", sentTo: "+234 803 123 4567" });
      expect(first.body.token).toBeUndefined();
      expect(sent.at(-1)).toMatch(/^Your MiliPay terminal code is \d{6}\. Someone is setting up a new POS terminal/);
      expect(db.table("pos_terminals")[0].terminal_api_key_hash).toBeNull();
      // The code is stored only as a keyed hash.
      expect(JSON.stringify(db.table("pos_pairing_codes"))).not.toContain(codeFrom(sent.at(-1)!));

      const done = await call("/login/verify", { body: { pairingId: first.body.pairingId, code: codeFrom(sent.at(-1)!), serial: LOGIN.serial } });
      expect(done.status).toBe(200);
      expect(done.body.token).toBeTruthy();
      expect(db.table("pos_terminals")[0].paired_merchant_id).toBe(M);
      // Paired now: the next login needs no code.
      expect((await call("/login", { body: LOGIN })).body.token).toBeTruthy();
    });

    it("another device can't finish the pairing, wrong codes run out, and a code works once", async () => {
      fresh();
      const first = await call("/login", { body: LOGIN });
      const code = codeFrom(sent.at(-1)!);
      expect((await call("/login/verify", { body: { pairingId: first.body.pairingId, code, serial: "OTHER-DEVICE" } })).status).toBe(404);
      const wrongCode = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 4; i++) {
        expect((await call("/login/verify", { body: { pairingId: first.body.pairingId, code: wrongCode, serial: LOGIN.serial } })).body.code).toBe("CODE_INCORRECT");
      }
      expect((await call("/login/verify", { body: { pairingId: first.body.pairingId, code: wrongCode, serial: LOGIN.serial } })).body.code).toBe("CODE_CLOSED");
      expect((await call("/login/verify", { body: { pairingId: first.body.pairingId, code, serial: LOGIN.serial } })).body.code).toBe("CODE_CLOSED");
      expect(db.table("pos_terminals")[0].paired_merchant_id).toBeNull();
    });

    it("a terminal moved from another merchant needs the code again", async () => {
      db.table("pos_terminals")[0].paired_merchant_id = "99999999-9999-4999-8999-999999999999";
      expect((await call("/login", { body: LOGIN })).body.step).toBe("code");
    });

    it("a wrong password still sends nothing", async () => {
      fresh();
      await call("/login", { body: { ...LOGIN, password: "nope" } });
      expect(sent).toEqual([]);
    });
  });
});
