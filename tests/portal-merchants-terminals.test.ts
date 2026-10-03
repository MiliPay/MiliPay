import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  heartbeatLabel,
  merchantActions,
  merchantPath,
  onboardedLabel,
  registerMerchantPath,
} from "../packages/shared/src/features/merchants/admin";
import {
  EMPTY_MERCHANT_FORM,
  accountName,
  merchantStepError,
  onboardingBody,
  type MerchantForm,
} from "../packages/shared/src/features/merchants/register";

/**
 * Portal redesign, step 5: Merchants, a merchant's page, POS terminals and
 * Register merchant. Every change to a merchant or terminal goes through an
 * audited server path, a new merchant waits for approval, and onboarding no
 * longer takes over an existing login.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const NOW = Date.parse("2026-10-03T12:00:00Z");

describe("merchant pages", () => {
  it("actions follow status, and only admins get any", () => {
    expect(merchantActions("pending", true)).toEqual(["approve", "fee"]);
    expect(merchantActions("active", true)).toEqual(["fee", "suspend"]);
    expect(merchantActions("suspended", true)).toEqual(["reactivate"]);
    expect(merchantActions("blacklisted", true)).toEqual([]);
    expect(merchantActions("active", false)).toEqual([]);
  });

  it("heartbeats and onboarding read like the design", () => {
    expect(heartbeatLabel(null, NOW)).toBe("Never");
    expect(heartbeatLabel("2026-10-03T11:59:40Z", NOW)).toBe("Just now");
    expect(heartbeatLabel("2026-10-03T11:42:00Z", NOW)).toBe("18 min ago");
    expect(heartbeatLabel("2026-09-30T12:00:00Z", NOW)).toBe("3 days ago");
    expect(onboardedLabel("2026-08-01T12:00:00Z", NOW)).toBe("2 mo ago");
    expect(onboardedLabel("2026-10-03T08:00:00Z", NOW)).toBe("Today");
  });

  it("links stay inside whichever portal the page is in", () => {
    expect(merchantPath("/dashboard/merchants", "m1")).toBe("/dashboard/merchants/m1");
    expect(merchantPath("/merchants", "m1")).toBe("/merchants/m1");
    expect(registerMerchantPath("/dashboard/merchants")).toBe("/dashboard/register/merchant");
    expect(registerMerchantPath("/merchants")).toBe("/merchants/register");
  });
});

describe("register merchant form", () => {
  const filled: MerchantForm = {
    ...EMPTY_MERCHANT_FORM,
    biz: "Lekki Fresh Mart",
    cat: "supermarket",
    state: "Lagos",
    addr: "Admiralty Way, Lekki",
    dir: "Funke Adebayo",
    dphone: "08031234567",
    dbvn: "22212345678",
    email: "owner@lekkifresh.ng",
    bank: "Guaranty Trust Bank (GTBank)",
    acct: "0123456789",
    acctName: "LEKKI FRESH MART LTD",
    tid: "TRM-1040",
    serial: "MP184021",
    model: "HFSecurity HP605PV",
  };

  it("each step says what's missing, in the design's words", () => {
    expect(merchantStepError(0, EMPTY_MERCHANT_FORM, "idle")).toBe("Enter the business name.");
    expect(merchantStepError(1, { ...filled, dbvn: "123" }, "idle")).toBe("BVN must be 11 digits.");
    expect(merchantStepError(2, { ...filled, fee: "7" }, "done")).toBe("Fee must be between 0 and 5%.");
    expect(merchantStepError(3, { ...filled, tid: "trm 1" }, "idle")).toMatch(/like TRM-1234/);
    for (const s of [0, 1, 2, 3]) expect(merchantStepError(s, filled, "done")).toBe("");
  });

  it("waits for the bank, and asks for the name only when the bank can't answer", () => {
    expect(merchantStepError(2, { ...filled, acctName: null }, "checking")).toMatch(/Checking/);
    expect(merchantStepError(2, { ...filled, acctName: null }, "done")).toBe("Type the name on the account.");
    const typed = { ...filled, acctName: null, acctNameTyped: "lekki fresh" };
    expect(accountName(typed)).toBe("LEKKI FRESH");
    expect(onboardingBody(typed, "058").settlementAccountName).toBe("lekki fresh");
    expect(onboardingBody(filled, "058").settlementAccountName).toBeNull();
  });
});

// ── onboard-merchant, run for real ────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let handler: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sent: string[];
let bankName: string | null;

async function call(body: Record<string, unknown>, token = "tok-agent") {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/onboard-merchant", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const create = () =>
  onboardingBody(
    {
      ...EMPTY_MERCHANT_FORM,
      biz: "Lekki Fresh Mart",
      cat: "supermarket",
      state: "Lagos",
      addr: "Admiralty Way, Lekki",
      dir: "Funke Adebayo",
      dphone: "08031234567",
      dbvn: "22212345678",
      email: "Owner@LekkiFresh.ng",
      bank: "Guaranty Trust Bank (GTBank)",
      acct: "0123456789",
      acctName: "LEKKI FRESH MART LTD",
      tid: "TRM-1040",
      serial: "MP184021",
      model: "HFSecurity HP605PV",
    },
    "058",
  );

describe("onboard-merchant", () => {
  beforeEach(async () => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
      MONO_SECRET_KEY: "mono-test-fixture-key", // secret-scan: allow — fake fixture, not a credential
    });
    (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
    if (!handler) {
      await import("../supabase/functions/onboard-merchant/index.ts");
      handler = (globalThis as any).__edgeHandler;
    }
    db = new FakeSupabase(
      {
        staff_profiles: [
          { id: "agent-1", role: "agent", full_name: "Bola Ahmed" },
          { id: "support-1", role: "support", full_name: "Samuel Okon" },
        ],
        merchants: [],
        pos_terminals: [{ id: "t0", terminal_id: "TRM-1001", device_serial_number: "MP100000", merchant_id: "m0" }],
      },
      { pos_terminals: ["terminal_id"] },
    );
    db.users.set("tok-agent", { id: "agent-1" });
    db.users.set("tok-support", { id: "support-1" });
    (globalThis as any).__fakeSupabase = db;
    sent = [];
    bankName = "LEKKI FRESH MART LTD";
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("/lookup/account")) {
        return new Response(JSON.stringify(bankName ? { data: { name: bankName } } : { message: "down" }), { status: bankName ? 200 : 503 });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      sent.push(body.sms ?? body.message ?? "");
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("creates a pending merchant with its terminal, logs it, and sends the director their login", async () => {
    const res = await call(create());
    expect(res.status).toBe(200);
    const m = db.table("merchants")[0];
    expect(m).toMatchObject({
      status: "pending",
      email: "owner@lekkifresh.ng",
      settlement_account_name: "LEKKI FRESH MART LTD",
      settlement_name_checked: true,
      mono_subaccount_id: null,
      onboarded_by: "agent-1",
    });
    expect(db.table("pos_terminals").find((t) => t.terminal_id === "TRM-1040")).toMatchObject({ merchant_id: m.id, assigned_by: "agent-1" });
    expect(db.table("audit_events")[0]).toMatchObject({ category: "Merchants", action: "registered merchant", target: "Lekki Fresh Mart" });
    expect(sent.join(" ")).toMatch(/owner@lekkifresh\.ng/);
    expect(res.body.credentials).toMatchObject({ email: "owner@lekkifresh.ng", delivered: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("refuses an email that already signs in, instead of resetting that person's password", async () => {
    db.authUsers.set("auth-customer", { id: "auth-customer", email: "owner@lekkifresh.ng" });
    const res = await call(create());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    expect(db.authUpdates).toEqual([]);
    expect(db.table("merchants")).toEqual([]);
  });

  it("a terminal that's already assigned stops everything before anything is created", async () => {
    const res = await call({ ...create(), terminalId: "TRM-1001" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TERMINAL_TAKEN");
    expect(db.createdUsers).toEqual([]);
    expect(db.table("merchants")).toEqual([]);
  });

  it("when the bank can't answer, the typed name is used and the merchant is marked unchecked", async () => {
    bankName = null;
    expect((await call(create())).body.code).toBe("ACCOUNT_NAME_NEEDED");
    const res = await call({ ...create(), settlementAccountName: "Lekki Fresh" });
    expect(res.status).toBe(200);
    expect(db.table("merchants")[0]).toMatchObject({ settlement_account_name: "LEKKI FRESH", settlement_name_checked: false });
  });

  it("looks up the account name for the form", async () => {
    const res = await call({ action: "resolve_account", bankCode: "058", accountNumber: "0123456789" });
    expect(res.body).toMatchObject({ success: true, name: "LEKKI FRESH MART LTD", checked: true });
  });

  it("support can't register merchants", async () => {
    expect((await call(create(), "tok-support")).status).toBe(403);
  });
});

describe("the database side", () => {
  const sql = read("supabase/migrations/20261003120000_merchants_and_terminals.sql");

  it("the portals can't write merchants or terminals directly any more", () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.merchants FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pos_terminals FROM PUBLIC, anon, authenticated;/);
  });

  it("the director's BVN and the terminal key hash aren't readable from the portals", () => {
    const grants = sql.match(/GRANT SELECT \([\s\S]*?\) ON public\.(merchants|pos_terminals) TO authenticated;/g) ?? [];
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g).not.toMatch(/director_bvn|terminal_api_key_hash/);
    const detail = sql.slice(sql.indexOf("FUNCTION public.staff_merchant_detail"), sql.indexOf("-- ── Terminals"));
    expect(detail).toMatch(/'bvnLast4', CASE WHEN v_m\.director_bvn IS NOT NULL THEN right\(v_m\.director_bvn, 4\) END/);
    expect(detail).not.toMatch(/'[a-zA-Z]+', v_m\.director_bvn\b/);
  });

  it("every merchant and terminal action needs a reason and writes the audit log in the same transaction", () => {
    for (const fn of ["admin_merchant_action", "admin_set_terminal_active"]) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}(`));
      const end = body.indexOf("$$;");
      expect(body.slice(0, end)).toMatch(/length\(trim\(coalesce\(p_reason, ''\)\)\) < 3/);
      expect(body.slice(0, end)).toMatch(/PERFORM public\.log_audit_event\(/);
    }
  });

  it("agents only see the merchants they registered", () => {
    expect(sql).toMatch(/v_role <> 'agent' OR m\.onboarded_by = auth\.uid\(\)/);
    expect(sql).toMatch(/v_role = 'agent' AND v_m\.onboarded_by IS DISTINCT FROM auth\.uid\(\)/);
  });
});
