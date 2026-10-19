import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { PHONE_CHECK_WINDOW_MS, localPhone, phoneCheckRefusal } from "../supabase/functions/_shared/agent-upgrade";
import { EMPTY_MERCHANT_FORM, agentMerchantStepError, agentOnboardingBody } from "../packages/shared/src/features/merchants/register";

/**
 * Agent Register customer and Register merchant (agent-portal handoff
 * screens 4 and 6): the customer's phone is checked by SMS code before an
 * agent can enrol them, and a merchant's first terminal comes from the
 * agent's stock or is assigned later.
 */

describe("phone check rules", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  const row = {
    agent_id: "agent-1",
    phone: "08031234567",
    expires_at: "2026-10-17T10:05:00Z",
    attempts: 0,
    code_verified_at: "2026-10-17T09:55:00Z",
    consumed_at: null,
    cancelled_at: null,
  };

  it("only this agent's confirmed, unused, recent check for this phone counts", () => {
    expect(phoneCheckRefusal(row, "agent-1", "+2348031234567", now)).toBeNull();
    expect(phoneCheckRefusal(null, "agent-1", "08031234567", now)).toMatch(/with a code first/);
    expect(phoneCheckRefusal(row, "agent-2", "08031234567", now)).toMatch(/with a code first/);
    expect(phoneCheckRefusal(row, "agent-1", "08039999999", now)).toMatch(/changed/);
    expect(phoneCheckRefusal({ ...row, code_verified_at: null }, "agent-1", "08031234567", now)).toMatch(/with a code first/);
    expect(phoneCheckRefusal({ ...row, consumed_at: "2026-10-17T09:58:00Z" }, "agent-1", "08031234567", now)).toMatch(/already used/);
    const late = new Date(Date.parse(row.code_verified_at) + PHONE_CHECK_WINDOW_MS + 1);
    expect(phoneCheckRefusal(row, "agent-1", "08031234567", late)).toMatch(/hour old/);
    expect(localPhone("803 123 4567")).toBe("08031234567");
    expect(localPhone("12345")).toBeNull();
  });
});

describe("agent merchant form", () => {
  const f = {
    ...EMPTY_MERCHANT_FORM,
    biz: "Bodija Pharmacy",
    cat: "pharmacy",
    dir: "Kemi Ola",
    dphone: "08031234567",
    dbvn: "22212345678",
    email: "kemi@bodija.ng",
    bank: "Access Bank",
    acct: "0123456789",
    acctName: "BODIJA PHARMACY",
    state: "Oyo",
    addr: "12 Bodija Market Road",
  };

  it("asks for the account check and a terminal choice; the body carries no made-up terminal", () => {
    expect(agentMerchantStepError(1, { ...f, acctName: null }, "idle", null)).toBe("Tap Check account name.");
    expect(agentMerchantStepError(3, f, "done", null)).toMatch(/stock, or Assign later/);
    const body = agentOnboardingBody(f, "044", { mode: "stock", id: "t-1", terminalId: "TRM-7" }, { latitude: 7.43, longitude: 3.91 });
    expect(body).toMatchObject({ terminalMode: "stock", stockTerminalId: "t-1", latitude: 7.43, longitude: 3.91 });
    expect(body).not.toHaveProperty("terminalId");
    expect(agentOnboardingBody(f, "044", { mode: "later" }, null)).not.toHaveProperty("stockTerminalId");
  });
});

// ── The functions, run for real ───────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let upgrade: (req: Request) => Promise<Response>;
let enrol: (req: Request) => Promise<Response>;
let onboard: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sms: string[];

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/agent-upgrade/index.ts");
  upgrade = (globalThis as any).__edgeHandler;
  await import("../supabase/functions/enrol-customer/index.ts");
  enrol = (globalThis as any).__edgeHandler;
  await import("../supabase/functions/onboard-merchant/index.ts");
  onboard = (globalThis as any).__edgeHandler;
});

async function call(fn: (req: Request) => Promise<Response>, body: unknown, token = "tok-agent") {
  const res = await fn(
    new Request("https://project.supabase.test/functions/v1/x", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const lastCode = () => /code is (\d{6})/.exec(sms[sms.length - 1] ?? "")?.[1] ?? "";

const enrolment = (extra: Record<string, unknown> = {}) => ({
  fullName: "Tolu Ade",
  dateOfBirth: "1994-03-02",
  gender: "female",
  nin: "12345678901",
  phone: "08031234567",
  address: "4 Ring Road",
  state: "Oyo",
  lga: "Ibadan South-West",
  palmVeinTemplate: "SIMULATED-PVT-1",
  faceTemplate: "SIMULATED-FACE-1",
  ...extra,
});

const merchant = (extra: Record<string, unknown>) => ({
  businessName: "Bodija Pharmacy",
  category: "pharmacy",
  address: "12 Bodija Market Road",
  state: "Oyo",
  directorName: "Kemi Ola",
  directorPhone: "08035550000",
  directorBvn: "22212345678",
  email: "kemi@bodija.ng",
  settlementBankName: "Access Bank",
  settlementBankCode: "044",
  settlementAccountNumber: "0123456789",
  settlementAccountName: "BODIJA PHARMACY",
  platformFeePercent: 1.2,
  settlementSchedule: "instant",
  ...extra,
});

describe("agent registration functions", () => {
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
      PASSWORD_DELIVERY_CHANNELS: "sms",
      ALLOW_SIMULATED_BIOMETRICS: "true",
    });
    db = new FakeSupabase({
      staff_profiles: [
        { id: "agent-1", role: "agent", full_name: "Chidi Okeke" },
        { id: "agent-2", role: "agent", full_name: "Bola Ade" },
        { id: "admin-1", role: "admin", full_name: "Ada Admin" },
      ],
      platform_settings: [],
      audit_events: [],
      agent_phone_checks: [],
      identity_verifications: [],
      palm_templates: [],
      customers: [{ id: "c-old", phone: "+2348050000000", status: "active" }],
      merchants: [],
      pos_terminals: [
        { id: "11111111-1111-4111-8111-111111111111", terminal_id: "TRM-7", merchant_id: null, held_by: "agent-1", is_active: true },
        { id: "22222222-2222-4222-8222-222222222222", terminal_id: "TRM-8", merchant_id: null, held_by: "agent-2", is_active: true },
      ],
    });
    db.users.set("tok-agent", { id: "agent-1" });
    db.users.set("tok-other", { id: "agent-2" });
    db.users.set("tok-admin", { id: "admin-1" });
    db.rpcAnswers.set("consume_rate_limit", () => true);
    (globalThis as any).__fakeSupabase = db;
    sms = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sms.push(String(JSON.parse(String(init?.body ?? "{}")).sms ?? ""));
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("a registered phone can't be checked again", async () => {
    const res = await call(upgrade, { action: "phone_request", phone: "0805 000 0000" });
    expect(res.body.code).toBe("PHONE_ALREADY_ENROLLED");
  });

  it("an agent can't enrol without a confirmed phone check; with one, it's used once", async () => {
    expect((await call(enrol, enrolment())).body.code).toBe("PHONE_NOT_CHECKED");

    const req = await call(upgrade, { action: "phone_request", phone: "08031234567" });
    expect(req.status).toBe(200);
    expect(sms.at(-1)).toContain("Your MiliPay registration code is");
    // Not confirmed yet.
    expect((await call(enrol, enrolment({ phoneCheckId: req.body.checkId }))).body.code).toBe("PHONE_NOT_CHECKED");
    // Another agent can't use it.
    expect((await call(upgrade, { action: "phone_verify", checkId: req.body.checkId, code: lastCode() }, "tok-other")).status).toBe(404);
    expect((await call(upgrade, { action: "phone_verify", checkId: req.body.checkId, code: lastCode() })).status).toBe(200);

    const ok = await call(enrol, enrolment({ phoneCheckId: req.body.checkId }));
    expect(ok.status).toBe(200);
    const saved = db.table("customers").find((c) => c.id === ok.body.customerId)!;
    expect(saved).toMatchObject({ status: "pending", lga: "Ibadan South-West", registered_by: "agent-1" });
    expect(saved.phone_verified_at).toBeTruthy();
    expect(db.table("agent_phone_checks")[0].consumed_at).toBeTruthy();
  });

  it("admins need the phone check too (since 2026-10-20), and can do it themselves", async () => {
    const without = await call(enrol, enrolment({ phone: "08061112222", nin: "12345678902" }), "tok-admin");
    expect(without.body.code).toBe("PHONE_NOT_CHECKED");

    const req = await call(upgrade, { action: "phone_request", phone: "08061112222" }, "tok-admin");
    expect(req.status).toBe(200);
    expect((await call(upgrade, { action: "phone_verify", checkId: req.body.checkId, code: lastCode() }, "tok-admin")).status).toBe(200);
    const res = await call(enrol, enrolment({ phone: "08061112222", nin: "12345678902", phoneCheckId: req.body.checkId }), "tok-admin");
    expect(res.status).toBe(200);
  });

  it("the phone check never goes by email", async () => {
    const res = await call(upgrade, { action: "phone_request", phone: "08061112223", channel: "email" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CHANNEL_UNAVAILABLE");
  });

  it("a merchant's terminal comes from the agent's own stock, or is assigned later", async () => {
    const stranger = await call(onboard, merchant({ terminalMode: "stock", stockTerminalId: "22222222-2222-4222-8222-222222222222" }));
    expect(stranger.body.code).toBe("NOT_IN_STOCK");
    expect(db.table("merchants")).toHaveLength(0);

    const ok = await call(onboard, merchant({ terminalMode: "stock", stockTerminalId: "11111111-1111-4111-8111-111111111111", latitude: 7.43, longitude: 3.91 }));
    expect(ok.status).toBe(200);
    expect(ok.body.terminal.terminal_id).toBe("TRM-7");
    const m = db.table("merchants")[0];
    expect(m).toMatchObject({ status: "pending", onboarded_by: "agent-1", latitude: 7.43, longitude: 3.91 });
    expect(db.table("pos_terminals").find((t) => t.terminal_id === "TRM-7")).toMatchObject({ merchant_id: m.id, held_by: null });

    const later = await call(onboard, merchant({ terminalMode: "later", email: "two@bodija.ng", businessName: "Bodija Pharmacy 2" }));
    expect(later.status).toBe(200);
    expect(later.body.terminal).toBeNull();
    expect((await call(onboard, merchant({ email: "three@bodija.ng" }))).body.error).toMatch(/terminal ID/);
  });
});
