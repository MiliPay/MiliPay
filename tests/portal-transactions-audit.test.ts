import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { detailRows, failureText, lifecycle, resolutions, type TxDetail } from "../packages/shared/src/features/transactions/admin";
import { auditRoleLabel, deviceLabel } from "../packages/shared/src/features/audit/api";
import { whenLabel } from "../packages/shared/src/lib/utils/format";

/**
 * Portal redesign, step 3: the transaction drawer's lifecycle and decisions,
 * Operations, and the audit log — written by the server for every decision,
 * never trusted to the browser.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const tx = (over: Partial<TxDetail> = {}): TxDetail => ({
  id: "t1",
  reference: "MP-BIL-1",
  amount: 5000,
  baseAmount: 5000,
  fee: 0,
  serviceCharge: 0,
  status: "delivered",
  palm: false,
  serviceType: "power",
  provider: "ikedc",
  via: "vtpass",
  beneficiary: "45012398761",
  merchantName: "IKEDC (prepaid)",
  terminalId: null,
  operatorReference: null,
  paymentProvider: "mono",
  paymentReference: "MONO-1",
  failureReason: null,
  createdAt: "2026-10-03T08:00:00Z",
  initiatedAt: "2026-10-03T08:00:00Z",
  paidAt: "2026-10-03T08:00:05Z",
  fulfilledAt: "2026-10-03T08:00:09Z",
  refundedAt: null,
  updatedAt: null,
  customer: { id: "c1", name: "Adaeze Okafor", tier: 2, phone: "0803" },
  merchant: null,
  account: { bank: "GTBank", last4: "6789" },
  refund: null,
  events: [],
  audit: [],
  tickets: [],
  ...over,
});
const states = (t: TxDetail) => lifecycle(t).map((s) => s.state);

describe("the transaction drawer", () => {
  it("marks exactly the step that is waiting or failed", () => {
    expect(states(tx())).toEqual(["done", "done", "done", "done"]);
    expect(states(tx({ status: "fulfilment_pending" }))).toEqual(["done", "done", "done", "current"]);
    expect(states(tx({ status: "payment_failed" }))).toEqual(["done", "failed", "todo", "todo"]);
    expect(states(tx({ status: "fulfilment_failed" }))).toEqual(["done", "done", "failed", "todo"]);
    expect(states(tx({ status: "refund_failed" }))).toEqual(["done", "done", "done", "failed"]);
    expect(lifecycle(tx({ status: "refunded" })).map((s) => s.label)).toEqual(["Initiated", "Bank debited", "Refund started", "Refunded"]);
  });

  it("palm payments have three steps, ending at the merchant", () => {
    const palm = tx({ palm: true, serviceType: null, terminalId: "TRM-1040", merchantName: "Lekki Fresh Mart" });
    expect(lifecycle(palm).map((s) => [s.label, s.state])).toEqual([
      ["Palm matched at terminal", "done"],
      ["Bank debited", "done"],
      ["Paid to merchant", "done"],
    ]);
  });

  it("offers only the decisions the database accepts", () => {
    expect(resolutions("fulfilment_pending")).toEqual(["mark_delivered", "refund"]);
    expect(resolutions("quarantined")).toEqual(["mark_delivered", "refund"]);
    expect(resolutions("refund_failed")).toEqual(["refund"]);
    expect(resolutions("delivered")).toEqual([]);
    expect(resolutions("fulfilling")).toEqual([]);
  });

  it("says why a payment was held, from the event that held it", () => {
    const held = tx({ status: "quarantined", events: [{ from: "initiated", to: "quarantined", reason: "amount mismatch: priced 5000, paid 4000", actor: "mono-webhook", at: "" }] });
    expect(failureText(held)).toMatch(/^Held for review: amount mismatch: priced 5000, paid 4000\./);
    expect(failureText(tx())).toBeNull();
  });

  it("details read like the design, with the meter for electricity", () => {
    const rows = Object.fromEntries(detailRows(tx()).map((r) => [r.k, r.v]));
    expect(rows).toMatchObject({ Customer: "Adaeze Okafor", Service: "Electricity · IKEDC", Meter: "45012398761", Provider: "VTPass", "Pay-from account": "GTBank ••6789" });
  });
});

describe("small helpers", () => {
  it("times read short", () => {
    const now = Date.parse("2026-10-03T13:00:00Z");
    expect(whenLabel("2026-10-03T12:40:00Z", now)).toBe("20m ago");
    expect(whenLabel("2026-10-03T08:05:00Z", now)).toBe("09:05");
    expect(whenLabel("2026-09-27T08:05:00Z", now)).toBe("27 Sept");
  });

  it("devices and roles read like people talk", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe("Safari · macOS");
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(auditRoleLabel("super_admin")).toBe("Super admin");
  });
});

// ── The server writes the audit log ───────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
let handler: (req: Request) => Promise<Response>;
let db: FakeSupabase;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/signup-review/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

describe("decisions are recorded by the server", () => {
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
    });
    db = new FakeSupabase({
      staff_profiles: [{ id: "admin-1", role: "admin", full_name: "Kunle Martins" }],
      signup_sessions: [{ id: "s1", phone: "08031234567", step: "review", nin: "12345678901", date_of_birth: "1994-03-14", review_reason: "flagged", smile_job_id: null, selfie_attempts: 3 }],
      smile_results: [],
    });
    db.users.set("tok-admin", { id: "admin-1" });
    (globalThis as any).__fakeSupabase = db;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message_id: "m1" }), { status: 200 })) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("a sign-up decision goes on the audit log with who made it and why", async () => {
    const res = await handler(
      new Request("https://project.supabase.test/functions/v1/signup-review", {
        method: "POST",
        headers: {
          Authorization: "Bearer tok-admin",
          "Content-Type": "application/json",
          "x-forwarded-for": "102.89.1.2, 10.0.0.1",
          "user-agent": "Mozilla/5.0 Chrome/129",
        },
        body: JSON.stringify({ action: "decide", sessionId: "s1", decision: "reject", reason: "Selfie does not match the NIN photo" }),
      }),
    );
    expect(res.status).toBe(200);
    const [event] = db.table("audit_events");
    expect(event).toMatchObject({
      actor_id: "admin-1",
      actor_name: "Kunle Martins",
      actor_role: "admin",
      category: "Sign-ups",
      action: "rejected sign-up",
      target: "08031234567",
      target_id: "s1",
      reason: "Selfie does not match the NIN photo",
      ip: "102.89.1.2",
      after: { step: "abandoned" },
    });
  });
});

describe("the database side", () => {
  const sql = read("supabase/migrations/20261003100000_transactions_operations_audit.sql");
  const resolve = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_resolve_transaction"));

  it("resolving a payment needs a reason and a second factor, and is logged in the same transaction", () => {
    expect(resolve).toMatch(/PERFORM public\.assert_staff_mfa\(\);/);
    expect(resolve).toMatch(/length\(v_note\) < 3/);
    expect(resolve).toMatch(/INSERT INTO public\.audit_events/);
  });

  it("the chain can be re-checked: one hash function writes and verifies", () => {
    const mfa = read("supabase/migrations/20261003090000_staff_two_factor_and_audit.sql");
    expect(mfa).toMatch(/NEW\.hash := public\.audit_event_hash\(NEW\);/);
    expect(sql).toMatch(/x\.hash <> x\.recomputed OR x\.prev_hash IS DISTINCT FROM x\.expected_prev/);
    // A time zone setting must not change what is hashed.
    expect(mfa).toMatch(/extract\(epoch FROM e\.occurred_at\)/);
  });

  it("every decision function writes the audit log", () => {
    for (const fn of ["approve-customer", "reject-customer", "signup-review", "create-staff", "vtu-service"]) {
      expect(read(`supabase/functions/${fn}/index.ts`)).toMatch(/recordAudit\(admin, req, caller,/);
    }
  });
});
