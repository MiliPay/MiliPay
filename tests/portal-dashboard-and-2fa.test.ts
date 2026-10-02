import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  conversion,
  delta,
  funnelRows,
  healthRows,
  ledgerTitle,
  providerName,
  sparkHeights,
  tierRows,
  yTicks,
} from "../packages/shared/src/features/dashboard/view";
import { groupResults } from "../packages/shared/src/components/layout/searchResults";
import { formatNairaCompact, timeAgo, initials } from "../packages/shared/src/lib/utils/format";

/**
 * Portal redesign, step 2: the admin Dashboard's arithmetic, the top-bar
 * search, and two-factor sign-in for staff — the server refuses a staff
 * session without a passed second factor once Settings › Security requires
 * it, and only then.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("dashboard numbers", () => {
  it("compares with the period before: percent, or points for a rate", () => {
    expect(delta(112, 100)).toEqual({ text: "12.0%", up: true });
    expect(delta(80, 100)).toEqual({ text: "20.0%", up: false });
    expect(delta(5, 0)).toBeNull(); // nothing to compare against
    expect(delta(0, 0)).toEqual({ text: "0%", up: true });
    expect(delta(97.1, 97.9, "points")).toEqual({ text: "0.8 pts", up: false });
    expect(delta(null, 90, "points")).toBeNull();
  });

  it("sparklines run from 20% to 100% of the tallest bar", () => {
    expect(sparkHeights([0, 5, 10])).toEqual([20, 60, 100]);
    expect(sparkHeights([0, 0, null])).toEqual([20, 20, 20]);
  });

  it("the funnel shows each step's share and its drop, red at 15% or more", () => {
    const rows = funnelRows([412, 361, 318, 251, 239, 226]);
    expect(rows.map((r) => r.drop)).toEqual([null, 12, 12, 21, 5, 5]);
    expect(rows.map((r) => r.bad)).toEqual([false, false, false, true, false, false]);
    expect(Math.round(rows[5].share)).toBe(55);
    expect(conversion([412, 361, 318, 251, 239, 226])).toBe(55);
    expect(conversion([0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it("provider health counts only what reached the provider", () => {
    const [row] = healthRows([{ service: "power", provider: "ikedc", via: "vtpass", total: 100, failed: 9, ok: 91 }]);
    expect(row).toMatchObject({ label: "Electricity", provider: "IKEDC · VTPass", rate: 91, low: true });
    const [palm] = healthRows([{ service: "palm", provider: "", via: "", total: 10, failed: 0, ok: 10 }]);
    expect(palm).toMatchObject({ provider: "MiliPay terminals", rate: 100, low: false });
    expect(providerName("gotv")).toBe("GOtv");
    expect(providerName("mtn-data")).toBe("MTN");
  });

  it("ledger titles read like the design", () => {
    const base = { id: "1", reference: "MP-1", amount: 1, status: "delivered", createdAt: "", provider: null, serviceType: null, merchantName: null };
    expect(ledgerTitle({ ...base, palm: true, customer: "Adaeze Okafor", merchantName: "Lekki Fresh Mart" })).toBe("Adaeze Okafor → Lekki Fresh Mart");
    expect(ledgerTitle({ ...base, palm: false, customer: "Adaeze Okafor", provider: "mtn", serviceType: "airtime" })).toBe("MTN Airtime · Adaeze Okafor");
  });

  it("chart ticks are round and tiers add up", () => {
    expect(yTicks(11_000_000)).toEqual({ top: 15_000_000, labels: ["₦15M", "₦10M", "₦5M", "₦0"] });
    expect(yTicks(0).labels).toEqual(["", "", "", "₦0"]);
    const t = tierRows({ "1": 25, "2": 75 });
    expect(t.map((r) => [r.count, Math.round(r.share)])).toEqual([[75, 75], [25, 25]]);
  });

  it("money and time read short", () => {
    expect(formatNairaCompact(950)).toBe("₦950");
    expect(formatNairaCompact(12_400)).toBe("₦12.4K");
    expect(formatNairaCompact(3_200_000)).toBe("₦3.2M");
    expect(formatNairaCompact(1_200_000_000)).toBe("₦1.20B");
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(timeAgo("2026-10-03T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-03T11:15:00Z", now)).toBe("45m ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toBe("2d ago");
    expect(initials("Adaeze  Okafor")).toBe("AO");
  });
});

describe("top-bar search", () => {
  it("groups results and links each to its page; empty groups are dropped", () => {
    const groups = groupResults({
      customers: [{ id: "c1", name: "Adaeze Okafor", phone: "08031234567", tier: 2, status: "active" }],
      transactions: [{ id: "t1", reference: "MP-4FZK9X", amount: 5000, status: "fulfilment_pending", customer: "Adaeze Okafor" }],
      merchants: [],
    });
    expect(groups.map((g) => g.label)).toEqual(["Customers", "Transactions"]);
    expect(groups[0].items[0]).toEqual({ title: "Adaeze Okafor", sub: "08031234567 · Tier 2", to: "/dashboard/customers/c1" });
    expect(groups[1].items[0].sub).toBe("Adaeze Okafor · ₦5,000 · Delivery pending");
  });
});

// ── Two-factor sign-in, at the Edge Functions ─────────────────────────────
const ENV: Record<string, string | undefined> = {};
type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
const realFetch = globalThis.fetch;
const jwt = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;
const AAL1 = jwt({ sub: "admin-1", aal: "aal1" });
const AAL2 = jwt({ sub: "admin-1", aal: "aal2" });

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/signup-review/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

function seed(mfaRequired: boolean) {
  Object.assign(ENV, {
    SUPABASE_URL: "https://project.supabase.test",
    SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
    SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  });
  db = new FakeSupabase({
    staff_profiles: [{ id: "admin-1", role: "admin" }],
    platform_settings: [{ id: 1, staff_mfa_required: mfaRequired }],
    signup_sessions: [],
    smile_results: [],
  });
  db.users.set(AAL1, { id: "admin-1" });
  db.users.set(AAL2, { id: "admin-1" });
  (globalThis as any).__fakeSupabase = db;
}

async function list(token: string) {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/signup-review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe("two-factor sign-in at the server", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no outbound calls expected");
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("while it is off, a password-only staff session works as before", async () => {
    seed(false);
    expect((await list(AAL1)).status).toBe(200);
  });

  it("once it is on, a password-only staff session is refused with MFA_REQUIRED", async () => {
    seed(true);
    const res = await list(AAL1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MFA_REQUIRED");
  });

  it("a session that passed the second factor is let through", async () => {
    seed(true);
    expect((await list(AAL2)).status).toBe(200);
  });
});

describe("two-factor and the audit log in the database", () => {
  const mfa = read("supabase/migrations/20261003090000_staff_two_factor_and_audit.sql");
  const dash = read("supabase/migrations/20261003091000_admin_dashboard_and_search.sql");

  it("starts off, so deploying the portals changes nothing until a super admin turns it on", () => {
    expect(mfa).toMatch(/staff_mfa_required boolean NOT NULL DEFAULT false/);
  });

  it("applies only to staff, through one restrictive policy on every table with row security", () => {
    expect(mfa).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.staff_profiles WHERE id = auth\.uid\(\)\)/);
    expect(mfa).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated/);
    expect(mfa).toMatch(/c\.relrowsecurity AND NOT c\.relispartition/);
  });

  it("the staff RPCs check it too, since they skip row security", () => {
    for (const fn of ["admin_resolve_transaction", "vtu_operations_snapshot", "delete_staff_user"]) expect(mfa).toContain(`'${fn}'`);
    expect(mfa).toMatch(/PERFORM public\.assert_staff_mfa\(\);/);
    expect(dash).toMatch(/PERFORM public\.assert_admin\(\);/);
  });

  it("audit events can't be changed or deleted, and each one hashes the one before", () => {
    expect(mfa).toMatch(/BEFORE UPDATE OR DELETE ON public\.audit_events/);
    expect(mfa).toMatch(/BEFORE TRUNCATE ON public\.audit_events/);
    expect(mfa).toMatch(/SELECT hash INTO NEW\.prev_hash FROM public\.audit_events ORDER BY id DESC LIMIT 1/);
  });

  it("the actor, IP and session come from the request, never from the caller", () => {
    const fn = mfa.slice(mfa.indexOf("CREATE OR REPLACE FUNCTION public.log_audit_event"));
    expect(fn).toMatch(/WHERE id = auth\.uid\(\)/);
    expect(fn).toMatch(/x-forwarded-for/);
    expect(fn).not.toMatch(/p_actor/);
  });
});

describe("two-factor in the portals", () => {
  const auth = read("packages/shared/src/features/auth/AuthContext.tsx");
  const login = read("packages/shared/src/pages/login/LoginPage.tsx");

  it("a staff member is only signed in once through the second factor", () => {
    expect(auth).toMatch(/isAuthenticated: user !== null && mfaStep === "ok"/);
    expect(auth).toMatch(/aal\?\.nextLevel === "aal2"\) return "verify"/);
  });

  it("an unreadable second-factor state asks for the code rather than waving them in", () => {
    expect(auth).toMatch(/step = "verify";/);
  });

  it("the three staff portals ask for it; the merchant portal does not", () => {
    for (const p of ["AdminPanel", "service-portal", "agent-portal"]) expect(read(`${p}/src/app/App.tsx`)).toMatch(/staffMfa auditTarget=/);
    expect(read("merchant-portal/src/app/App.tsx")).not.toMatch(/staffMfa/);
  });

  it("the sign-in panel only claims two-factor is required when it is", () => {
    expect(login).toMatch(/\{mfaRequired && \(/);
  });

  it("signing out keeps the theme", () => {
    expect(auth).toMatch(/KEEP_ON_SIGN_OUT = \/\^milipay\\\.theme\\\.\//);
  });
});
