import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  CAPTURE_WINDOW_MS,
  MAX_ATTEMPTS,
  captureClosed,
  codeClosed,
  maskedPhone,
  upgradeRefusal,
  upgradeSms,
} from "../supabase/functions/_shared/agent-upgrade";

/**
 * The agent portal redesign (agent-portal/design_handoff_agent): the RPCs
 * behind the dashboard, Find customer, My registrations, Earnings,
 * Leaderboard and terminal stock, and the agent-upgrade function (Tier 2
 * upgrade, Fix and resubmit).
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL = read("supabase/migrations/20261017090000_agent_portal.sql");

describe("agent portal migration", () => {
  const rpcs = [
    "agent_home()",
    "agent_find_customers(text)",
    "agent_registrations(text)",
    "agent_earnings()",
    "agent_leaderboard(text)",
    "agent_stock()",
    "agent_assign_terminal(uuid, uuid)",
  ];

  it("every agent RPC checks the role and is closed to anon", () => {
    for (const sig of rpcs) {
      const name = sig.split("(")[0];
      const body = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`));
      expect(body.slice(0, body.indexOf("$$;"))).toContain("public.assert_staff(ARRAY['agent', 'admin', 'super_admin'])");
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
    // The helpers are internal: nobody calls them directly.
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.agent_rate(text) FROM PUBLIC, anon, authenticated;");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.agent_earned(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;");
  });

  it("new tables are the server's alone, with service_role granted", () => {
    for (const t of ["agent_commission_rates", "agent_payouts", "agent_upgrade_codes"]) {
      expect(SQL).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated;`);
      expect(SQL).toContain(`GRANT ALL ON public.${t} TO service_role;`);
    }
  });

  it("commission is the placeholder rates and only counts approved work", () => {
    expect(SQL).toContain("('customer', 200), ('upgrade', 300), ('merchant', 1000)");
    const earned = SQL.slice(SQL.indexOf("FUNCTION public.agent_earned("), SQL.indexOf("-- ── Dashboard"));
    expect(earned).toContain("status = 'active' AND verified_at >= p_from");
    expect(earned).toContain("status = 'active' AND approved_at >= p_from");
  });

  it("Find customer hides other agents' customers' phone numbers; terminals assign only from your own stock", () => {
    expect(SQL).toContain("CASE WHEN c.registered_by = auth.uid() THEN c.phone ELSE '•••• ' || right(c.phone, 4) END AS phone");
    expect(SQL).toContain("v_role = 'agent' AND t.held_by IS DISTINCT FROM auth.uid()");
    expect(SQL).toContain("v_role = 'agent' AND m.onboarded_by IS DISTINCT FROM auth.uid()");
    expect(SQL).toContain("PERFORM public.log_audit_event('Terminals', 'assigned terminal'");
  });
});

describe("upgrade rules", () => {
  const ok = { status: "active", kyc_tier: 1, nin_verified: true, has_palm_template: false, phone: "08031234567" };

  it("only an active, NIN-verified Tier 1 customer with no palm can be upgraded", () => {
    expect(upgradeRefusal(ok)).toBeNull();
    expect(upgradeRefusal(null)?.code).toBe("NOT_FOUND");
    expect(upgradeRefusal({ ...ok, status: "suspended" })?.code).toBe("NOT_ACTIVE");
    expect(upgradeRefusal({ ...ok, kyc_tier: 2 })?.code).toBe("ALREADY_UPGRADED");
    expect(upgradeRefusal({ ...ok, has_palm_template: true })?.code).toBe("HAS_PALM");
    expect(upgradeRefusal({ ...ok, nin_verified: false })?.code).toBe("NIN_NOT_VERIFIED");
  });

  it("codes close when used, replaced, guessed or expired; the palm must follow within 15 minutes", () => {
    const now = new Date("2026-10-17T10:00:00Z");
    const base = { expires_at: "2026-10-17T10:05:00Z", attempts: 0, code_verified_at: null, consumed_at: null, cancelled_at: null };
    expect(codeClosed(base, now)).toBeNull();
    expect(codeClosed({ ...base, attempts: MAX_ATTEMPTS }, now)).toMatch(/Too many/);
    expect(codeClosed({ ...base, expires_at: "2026-10-17T09:59:00Z" }, now)).toMatch(/expired/);
    expect(captureClosed(base, now)).toMatch(/code first/);
    const verified = { ...base, code_verified_at: "2026-10-17T09:50:00Z" };
    expect(captureClosed(verified, now)).toBeNull();
    expect(captureClosed(verified, new Date(Date.parse(verified.code_verified_at) + CAPTURE_WINDOW_MS + 1))).toMatch(/too long/);
  });

  it("the SMS names the agent; the agent only sees the last 4 digits", () => {
    expect(upgradeSms("123456", "Chidi Okeke")).toContain("Chidi from MiliPay is upgrading your account to Tier 2. Your code is 123456.");
    expect(maskedPhone("+2348031234567")).toBe("•••• 4567");
  });
});

// ── agent-upgrade, run for real ───────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let fn: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sms: string[];

const C = "11111111-1111-4111-8111-111111111111";
const D = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/agent-upgrade/index.ts");
  fn = (globalThis as any).__edgeHandler;
});

async function call(body: unknown, token = "tok-agent") {
  const res = await fn(
    new Request("https://project.supabase.test/functions/v1/agent-upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const lastCode = () => /Your code is (\d{6})/.exec(sms[sms.length - 1] ?? "")?.[1] ?? "";

describe("agent-upgrade function", () => {
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
        { id: "cust-1", role: null },
      ],
      platform_settings: [],
      audit_events: [],
      agent_upgrade_codes: [],
      customers: [
        { id: C, first_name: "Musa", last_name: "Bello", phone: "08031234567", status: "active", kyc_tier: 1, nin_verified: true, has_palm_template: false },
        {
          id: D, first_name: "Ngozi", last_name: "Eze", phone: "08059998888", status: "rejected", kyc_tier: 1, registered_by: "agent-1",
          rejection_reason: "Palm scan too blurry",
        },
      ],
    });
    db.users.set("tok-agent", { id: "agent-1" });
    db.users.set("tok-other", { id: "agent-2" });
    db.users.set("tok-cust", { id: "cust-1" });
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

  it("only staff agents can use it", async () => {
    expect((await call({ action: "request", customerId: C }, "tok-cust")).status).toBe(403);
  });

  it("code, palm, Tier 2: the customer is upgraded by this agent, and it's audited", async () => {
    const req = await call({ action: "request", customerId: C });
    expect(req.status).toBe(200);
    expect(req.body.sentTo).toBe("•••• 4567");
    expect(db.table("agent_upgrade_codes")[0].code_hash).toMatch(/^[0-9a-f]{64}$/);

    // Palm before the code: refused.
    expect((await call({ action: "complete", requestId: req.body.requestId, palmVeinTemplate: "SIMULATED-PVT-1", quality: 88 })).body.code).toBe("CODE_CLOSED");
    // Someone else's code isn't theirs to use.
    expect((await call({ action: "verify", requestId: req.body.requestId, code: lastCode() }, "tok-other")).status).toBe(404);

    const wrong = await call({ action: "verify", requestId: req.body.requestId, code: "000000" === lastCode() ? "111111" : "000000" });
    expect(wrong.body.code).toBe("WRONG_CODE");
    expect((await call({ action: "verify", requestId: req.body.requestId, code: lastCode() })).status).toBe(200);

    expect((await call({ action: "complete", requestId: req.body.requestId, palmVeinTemplate: "SIMULATED-PVT-1", quality: 55 })).body.code).toBe("LOW_QUALITY");
    const done = await call({ action: "complete", requestId: req.body.requestId, palmVeinTemplate: "SIMULATED-PVT-1", quality: 88 });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ tier: 2, maxSingle: 150000, maxDaily: 500000 });
    const c = db.table("customers").find((r) => r.id === C)!;
    expect(c).toMatchObject({ kyc_tier: 2, upgraded_by: "agent-1", palm_vein_template: "SIMULATED-PVT-1" });
    expect(db.table("audit_events").at(-1)).toMatchObject({ action: "upgraded to Tier 2", target_id: C });

    // The code is spent.
    expect((await call({ action: "complete", requestId: req.body.requestId, palmVeinTemplate: "SIMULATED-PVT-2", quality: 90 })).body.code).toBe("CODE_CLOSED");
  });

  it("refuses a simulated palm in production", async () => {
    ENV.ALLOW_SIMULATED_BIOMETRICS = undefined;
    const req = await call({ action: "request", customerId: C });
    await call({ action: "verify", requestId: req.body.requestId, code: lastCode() });
    const res = await call({ action: "complete", requestId: req.body.requestId, palmVeinTemplate: "SIMULATED-PVT-1", quality: 90 });
    expect(res.body.code).toBe("SIMULATED_BIOMETRIC_REJECTED");
    expect(db.table("customers").find((r) => r.id === C)!.kyc_tier).toBe(1);
  });

  it("Fix and resubmit: only the registering agent, only a declined registration, back to pending", async () => {
    expect((await call({ action: "resubmit", customerId: D, palmVeinTemplate: "SIMULATED-PVT-9", palmQuality: 80 }, "tok-other")).status).toBe(404);
    expect((await call({ action: "resubmit", customerId: D })).body.code).toBe("NO_CAPTURE");
    const ok = await call({ action: "resubmit", customerId: D, palmVeinTemplate: "SIMULATED-PVT-9", palmQuality: 80 });
    expect(ok.status).toBe(200);
    expect(db.table("customers").find((r) => r.id === D)).toMatchObject({ status: "pending", rejection_reason: null, palm_vein_template: "SIMULATED-PVT-9" });
    expect((await call({ action: "resubmit", customerId: D, palmVeinTemplate: "SIMULATED-PVT-9", palmQuality: 80 })).body.code).toBe("NOT_DECLINED");
  });
});
