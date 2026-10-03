import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { assignableRoles, canManage, deviceLabel } from "../packages/shared/src/features/staff/roles";
import { feeError, signupError, tierError } from "../packages/shared/src/features/settings/api";
import { staffStatus } from "../packages/shared/src/pages/staff/StaffPage";
import { effectiveLimits } from "../supabase/functions/_shared/tier-math";

/**
 * Portal redesign, step 6: Staff and Settings. Staff changes go through
 * staff-admin with a reason; an admin manages agents and support, only a
 * super admin manages administrators, and nobody acts on themselves. Tier
 * limits live in the database and the payment checks read them; settings
 * saves need a reason and are audited; two-factor can't be switched on by
 * someone who'd be locked out by it.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL = read("supabase/migrations/20261003130000_staff_and_settings.sql");
const fn = (name: string) => {
  const body = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`));
  return body.slice(0, body.indexOf("$$;"));
};

describe("who manages whom", () => {
  it("an admin manages agents and support; a super admin manages everyone; nobody themselves", () => {
    expect(canManage("admin", "agent", false)).toBe(true);
    expect(canManage("admin", "support", false)).toBe(true);
    expect(canManage("admin", "admin", false)).toBe(false);
    expect(canManage("admin", "super_admin", false)).toBe(false);
    expect(canManage("super_admin", "admin", false)).toBe(true);
    expect(canManage("super_admin", "super_admin", true)).toBe(false);
    expect(canManage("support", "agent", false)).toBe(false);
    expect(assignableRoles("admin")).toEqual(["agent", "support"]);
    expect(assignableRoles("super_admin")).toContain("super_admin");
  });

  it("status reads Invited until the first sign-in", () => {
    expect(staffStatus({ status: "active", lastSignIn: null })).toEqual(["Invited", "warn"]);
    expect(staffStatus({ status: "active", lastSignIn: "2026-10-01T10:00:00Z" })).toEqual(["Active", "ok"]);
    expect(staffStatus({ status: "suspended", lastSignIn: "2026-10-01T10:00:00Z" })).toEqual(["Suspended", "fail"]);
  });

  it("sessions are named by browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15")).toBe("Safari · macOS");
    expect(deviceLabel(null)).toBe("Unknown device");
  });
});

describe("settings rules", () => {
  const tiers = [
    { tier: 1 as const, maxSingle: 50000, maxDaily: 200000, pinOver: 10000 },
    { tier: 2 as const, maxSingle: 150000, maxDaily: 500000, pinOver: 10000 },
  ];
  it("tier limits must make sense before they can be saved", () => {
    expect(tierError(tiers)).toBe("");
    expect(tierError([{ ...tiers[0], maxSingle: 300000 }])).toMatch(/can't be more than the daily limit/);
    expect(tierError([{ ...tiers[0], pinOver: 60000 }])).toMatch(/PIN amount/);
    expect(tierError([{ ...tiers[0], maxDaily: 0 }])).toMatch(/filled in/);
  });

  it("sign-up rules and fees stay within range", () => {
    expect(signupError({ enabled: true, selfieAttempts: 6, abandonHours: 168 })).toMatch(/1 and 5/);
    expect(signupError({ enabled: true, selfieAttempts: 3, abandonHours: 12 })).toMatch(/24 and 720/);
    const fees = { palm: "1.5", airtime: "0", data: "25", electricity: "0", cable: "30" };
    expect(feeError(fees)).toBe("");
    expect(feeError({ ...fees, palm: "0" })).toMatch(/between 0 and 5%/);
    expect(feeError({ ...fees, data: "20000" })).toMatch(/Data/);
  });

  it("the payment check uses the ceilings Settings has, never above them", () => {
    // Settings lowered Tier 2 to 100k / 300k.
    const caps = { maxSingle: 100_000, maxDaily: 300_000 };
    expect(effectiveLimits(2, null, null, caps)).toMatchObject({ maxSingle: 100_000, maxDaily: 300_000 });
    // A customer's own 120k is above the new ceiling, so the ceiling wins.
    expect(effectiveLimits(2, 120_000, null, caps).maxSingle).toBe(100_000);
    // A lower own limit still binds.
    expect(effectiveLimits(2, 40_000, null, caps)).toMatchObject({ maxSingle: 40_000, singleIsCustomerSet: true });
  });

  it("enforceTransactionLimits asks the database for the ceilings and stops if it can't", () => {
    const limits = read("supabase/functions/_shared/limits.ts");
    expect(limits).toMatch(/admin\.rpc\("tier_caps", \{ p_tier: kycTier \}\)/);
    expect(limits).toMatch(/LIMIT_CHECK_UNAVAILABLE/);
  });
});

// ── staff-admin and signup, run for real ─────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let staffAdmin: (req: Request) => Promise<Response>;
let signup: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sent: string[];

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/staff-admin/index.ts");
  staffAdmin = (globalThis as any).__edgeHandler;
  await import("../supabase/functions/signup/index.ts");
  signup = (globalThis as any).__edgeHandler;
});

async function call(body: Record<string, unknown>, token = "tok-admin") {
  const res = await staffAdmin(
    new Request("https://project.supabase.test/functions/v1/staff-admin", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const AGENT = "11111111-1111-4111-8111-111111111111";
const ADMIN2 = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";

describe("staff-admin", () => {
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
      PASSWORD_DELIVERY_CHANNELS: "sms",
    });
    db = new FakeSupabase({
      staff_profiles: [
        { id: ME, role: "admin", full_name: "Kunle Martins", status: "active" },
        { id: AGENT, role: "agent", full_name: "Bola Ahmed", email: "bola@milipay.ng", phone: "08031234567", status: "active" },
        { id: ADMIN2, role: "admin", full_name: "Grace Etim", email: "grace@milipay.ng", phone: "08051234567", status: "active" },
      ],
    });
    db.users.set("tok-admin", { id: ME });
    db.rpcAnswers.set("revoke_auth_sessions", () => 1);
    db.factors.set(AGENT, [{ id: "f1", factor_type: "totp", status: "verified" }]);
    (globalThis as any).__fakeSupabase = db;
    sent = [];
    globalThis.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      sent.push(String(JSON.parse(String(init?.body ?? "{}")).sms ?? ""));
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("needs a reason", async () => {
    expect((await call({ staffId: AGENT, action: "suspend", reason: "" })).status).toBe(400);
  });

  it("an admin can't touch another admin, make one, or act on themselves", async () => {
    expect((await call({ staffId: ADMIN2, action: "suspend", reason: "Left the company" })).body.code).toBe("INSUFFICIENT_ROLE");
    expect((await call({ staffId: AGENT, action: "change_role", role: "admin", reason: "Promotion" })).body.code).toBe("INSUFFICIENT_ROLE");
    expect((await call({ staffId: ME, action: "reset_2fa", reason: "Lost phone" })).body.code).toBe("SELF");
  });

  it("suspending bans the login, ends every session and goes on the audit log", async () => {
    const res = await call({ staffId: AGENT, action: "suspend", reason: "Left the company" });
    expect(res.status).toBe(200);
    expect(db.table("staff_profiles").find((s) => s.id === AGENT)!.status).toBe("suspended");
    expect(db.authUpdates[0]).toMatchObject({ id: AGENT, attributes: { ban_duration: "876000h" } });
    expect(db.rpcCalls).toContainEqual({ name: "revoke_auth_sessions", args: { p_user: AGENT } });
    expect(db.table("audit_events")[0]).toMatchObject({ category: "Staff", action: "suspended staff", reason: "Left the company", target_id: AGENT });
  });

  it("a role change updates the token's role too, and signs them out", async () => {
    const res = await call({ staffId: AGENT, action: "change_role", role: "support", reason: "Moved to the help desk" });
    expect(res.status).toBe(200);
    expect(db.table("staff_profiles").find((s) => s.id === AGENT)!.role).toBe("support");
    expect(db.authUpdates[0]).toMatchObject({ id: AGENT, attributes: { app_metadata: { role: "support" } } });
    expect(db.rpcCalls.some((c) => c.name === "revoke_auth_sessions")).toBe(true);
  });

  it("reset 2FA removes their authenticator", async () => {
    expect((await call({ staffId: AGENT, action: "reset_2fa", reason: "Lost phone" })).status).toBe(200);
    expect(db.factors.get(AGENT)).toEqual([]);
  });

  it("reset password texts a one-time password and never returns it", async () => {
    const res = await call({ staffId: AGENT, action: "reset_password", reason: "Forgot it" });
    expect(res.status).toBe(200);
    const password = String(db.authUpdates[0].attributes.password);
    expect(password.length).toBeGreaterThan(8);
    expect(sent[0]).toContain(password);
    expect(sent[0]).toMatch(/bola@milipay\.ng/);
    expect(JSON.stringify(res.body)).not.toContain(password);
  });
});

describe("self sign-up follows Settings", () => {
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
      PASSWORD_DELIVERY_CHANNELS: "sms",
    });
    db = new FakeSupabase({
      customers: [],
      signup_sessions: [],
      platform_settings: [{ id: 1, self_signup_enabled: false, selfie_attempts: 2, signup_abandon_hours: 48 }],
    });
    db.rpcAnswers.set("consume_rate_limit", () => true);
    (globalThis as any).__fakeSupabase = db;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message_id: "m1" }), { status: 200 })) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const start = async () => {
    const res = await signup(
      new Request("https://project.supabase.test/functions/v1/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ action: "start", phone: "08031234567" }),
      }),
    );
    return { status: res.status, body: (await res.json()) as any };
  };

  it("when it's switched off, people are sent to an agent", async () => {
    const res = await start();
    expect(res.body.code).toBe("SIGNUP_PAUSED");
    expect(res.body.error).toMatch(/Visit any MiliPay agent/);
    expect(db.table("signup_sessions")).toEqual([]);
  });

  it("when it's on, a sign-up expires after the hours Settings gives it", async () => {
    db.table("platform_settings")[0].self_signup_enabled = true;
    const before = Date.now();
    expect((await start()).status).toBe(200);
    const expires = Date.parse(String(db.table("signup_sessions")[0].expires_at));
    expect(expires - before).toBeGreaterThan(47 * 3600_000);
    expect(expires - before).toBeLessThan(49 * 3600_000);
  });
});

describe("the database side", () => {
  it("tier_caps reads the table, and saving limits needs a reason and is audited", () => {
    expect(fn("tier_caps")).toMatch(/FROM public\.tier_limits t/);
    const save = fn("admin_save_tier_limits");
    expect(save).toMatch(/length\(trim\(coalesce\(p_reason, ''\)\)\) < 3/);
    expect(save).toMatch(/PERFORM public\.log_audit_event\('Settings'/);
    expect(save).toMatch(/PERFORM public\.assert_admin\(\)/);
  });

  it("two-factor can't be required by a session that hasn't passed it", () => {
    expect(fn("admin_save_platform_settings")).toMatch(
      /v_new\.staff_mfa_required AND NOT v_old\.staff_mfa_required AND coalesce\(auth\.jwt\(\) ->> 'aal', ''\) <> 'aal2'/,
    );
  });

  it("admins can no longer rewrite staff rows from the browser, and nobody reads a staff NIN", () => {
    expect(SQL).toMatch(/DROP POLICY IF EXISTS "Admins have full access to staff_profiles" ON public\.staff_profiles;/);
    expect(SQL).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.staff_profiles FROM PUBLIC, anon, authenticated;/);
    const grant = SQL.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.staff_profiles TO authenticated;/);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/\bnin\b(?!_last_4)/);
  });

  it("a staff profile and its sessions never expose secrets", () => {
    const detail = fn("admin_staff_detail");
    expect(detail).not.toMatch(/refresh_token|encrypted_password|secret|'nin', v_s\.nin\b/);
  });
});
