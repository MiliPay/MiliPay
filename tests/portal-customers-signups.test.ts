import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { kycRows, limitRows, profileBanner, securityEvents, connectedRecords, type CustomerDetail } from "../packages/shared/src/features/customers/admin";
import { canApprove, progressBars, smileChip, stepNumber, whyHere, type SignupDetail } from "../packages/shared/src/features/signups/admin";
import { customerPath } from "../packages/shared/src/pages/customers/CustomersPage";
import { reminderSms, reviewSms } from "../supabase/functions/_shared/signup";

/**
 * Portal redesign, step 4: Customers, the customer profile and Sign-ups.
 * The account actions (suspend, reactivate, reset password) and sign-up
 * decisions run on the server, need a reason, end sessions where it matters,
 * and go on the audit log.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const customer = (over: Partial<CustomerDetail> = {}): CustomerDetail => ({
  id: "c1",
  name: "Adaeze Okafor",
  firstName: "Adaeze",
  lastName: "Okafor",
  phone: "08031234567",
  email: null,
  address: "4 Admiralty Way",
  landmark: null,
  state: "Lagos",
  lga: "Eti-Osa",
  ninLast4: "4821",
  bvnLast4: null,
  ninVerified: true,
  bvnVerified: null,
  dob: "1994-03-14",
  gender: "female",
  status: "active",
  tier: 2,
  source: "agent",
  hasPalm: true,
  hasFace: true,
  palmSimulated: false,
  faceSimulated: false,
  selfieVerifiedAt: null,
  palmPaused: false,
  pinThreshold: 10000,
  singleLimit: null,
  dailyLimit: 100000,
  rejectionReason: null,
  createdAt: "2026-09-01T10:00:00Z",
  verifiedAt: "2026-09-02T10:00:00Z",
  passwordChangedAt: "2026-09-03T10:00:00Z",
  biometricEnrolledAt: null,
  onboardingCompletedAt: "2026-09-03T10:00:00Z",
  hasLogin: true,
  tierCaps: { maxSingle: 150000, maxDaily: 500000 },
  registeredBy: { name: "Bola Ahmed", state: "Lagos", role: "agent" },
  verifiedBy: "Tolu Adeyemi",
  palm: { captures: 2, quality: 88 },
  accounts: [],
  signup: null,
  security: { passwordResetAt: null, contactChanges: [], lastCodeSignIn: "2026-10-01T08:00:00Z", devices: [] },
  tickets: [{ id: "k1", ticketId: "MP-4821", subject: "Token not received", status: "open", createdAt: "2026-10-01T08:00:00Z" }],
  mismatches: [],
  audit: [],
  txCount: 0,
  txTotal: 0,
  txs: [],
  ...over,
});

describe("the customer profile", () => {
  it("limits show the tier ceiling, or their own lower limit", () => {
    expect(limitRows(customer())).toEqual([
      { k: "Per payment", v: "₦150,000" },
      { k: "Daily", v: "₦100,000 (their own limit)" },
      { k: "PIN required over", v: "₦10,000" },
    ]);
  });

  it("a self sign-up reads as one, with the Tier 1 banner from the real tier limits", () => {
    const self = customer({ source: "self", tier: 1, selfieVerifiedAt: "2026-10-01T08:00:00Z", tierCaps: { maxSingle: 50000, maxDaily: 200000 } });
    expect(kycRows(self).find((r) => r.k === "NIN")?.badge?.text).toBe("NIMC + selfie");
    expect(kycRows(self).find((r) => r.k === "Registered by")?.v).toBe("Self sign-up · app");
    expect(profileBanner(self)?.body).toMatch(/limits are ₦50,000 per payment and ₦200,000 a day/);
  });

  it("a pending agent registration says who registered them", () => {
    expect(profileBanner(customer({ status: "pending" }))).toMatchObject({ tone: "warn", body: expect.stringMatching(/^Registered by Bola Ahmed \(Lagos\)/) });
  });

  it("security events are only what we record, newest first", () => {
    const events = securityEvents(customer());
    expect(events.map((e) => e.text)).toEqual(["Signed in with an SMS code", "Password set or changed", "Phone number verified"]);
  });

  it("connected records link tickets", () => {
    expect(connectedRecords(customer())).toEqual([{ kind: "ticket", id: "k1", label: "MP-4821 · Token not received", sub: "Open ticket" }]);
  });

  it("the list links to the profile in whichever portal it's in", () => {
    expect(customerPath("/dashboard/customers", "c1")).toBe("/dashboard/customers/c1");
    expect(customerPath("/customers", "c1")).toBe("/customers/c1");
  });
});

describe("sign-ups", () => {
  const detail = (over: Partial<SignupDetail> = {}): SignupDetail => ({
    id: "s1",
    phone: "08031234567",
    name: null,
    step: "review",
    status: "review",
    decision: null,
    reason: "three_failed_selfies",
    attempts: 3,
    selfieFailure: "face_not_clear",
    ninLast4: "8901",
    dob: "1994-03-14",
    state: null,
    lga: null,
    createdAt: "",
    updatedAt: "",
    phoneVerifiedAt: "",
    consentAt: "",
    confirmedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    remindedAt: null,
    customerId: null,
    smile: null,
    ...over,
  });

  it("progress, chips and why-it's-here read like the design", () => {
    expect(stepNumber("review", "review")).toBe(3);
    expect(progressBars({ step: "review", status: "review" })).toEqual(["done", "done", "warn", "todo", "todo"]);
    expect(progressBars({ step: "done", status: "completed" })).toEqual(["done", "done", "done", "done", "done"]);
    expect(smileChip({ status: "review", smileStatus: null, step: "review", attempts: 3 })).toEqual(["Selfie failed", "warn"]);
    expect(smileChip({ status: "review", smileStatus: "attention", step: "review", attempts: 1 })).toEqual(["Flagged", "fail"]);
    expect(whyHere(detail())).toBe("3 selfie attempts failed.");
  });

  it("approve is offered only against NIMC's own matching record", () => {
    expect(canApprove(detail())).toBe(false);
    const smile = { jobId: "j1", status: "attention", reason: null, risk: null, confidence: null, selfieUrl: null, photoUrl: null, nimcName: "Adaeze Okafor", ninMatches: true, dobMatches: true };
    expect(canApprove(detail({ smile }))).toBe(true);
    expect(canApprove(detail({ smile: { ...smile, dobMatches: false } }))).toBe(false);
  });

  it("the texts for an agent visit and a reminder don't carry anything secret", () => {
    expect(reviewSms("agent")).toMatch(/Visit any MiliPay agent with your NIN/);
    expect(reminderSms()).toMatch(/Continue signing up/);
    expect(reminderSms()).not.toMatch(/\d{4,}/);
  });
});

// ── customer-admin, run for real ─────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let handler: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sms: string[];

async function call(body: Record<string, unknown>, token = "tok-admin") {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/customer-admin", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe("customer-admin", () => {
  beforeEach(async () => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
      TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
    });
    (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
    if (!handler) {
      await import("../supabase/functions/customer-admin/index.ts");
      handler = (globalThis as any).__edgeHandler;
    }
    db = new FakeSupabase({
      staff_profiles: [
        { id: "admin-1", role: "admin", full_name: "Kunle Martins" },
        { id: "support-1", role: "support", full_name: "Samuel Okon" },
      ],
      customers: [{ id: "11111111-2222-4333-8444-555555555555", first_name: "Adaeze", last_name: "Okafor", phone: "08031234567", status: "active", auth_user_id: "auth-c1" }],
    });
    db.users.set("tok-admin", { id: "admin-1" });
    db.users.set("tok-support", { id: "support-1" });
    db.rpcAnswers.set("revoke_auth_sessions", () => 2);
    (globalThis as any).__fakeSupabase = db;
    sms = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sms.push(JSON.parse(String(init?.body ?? "{}")).sms);
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("suspending needs a reason, ends every session, texts them and goes on the audit log", async () => {
    expect((await call({ customerId: "11111111-2222-4333-8444-555555555555", action: "suspend", reason: "" })).status).toBe(400);
    const res = await call({ customerId: "11111111-2222-4333-8444-555555555555", action: "suspend", reason: "Reported stolen phone" });
    expect(res.status).toBe(200);
    expect(db.table("customers")[0].status).toBe("suspended");
    expect(db.rpcCalls).toContainEqual({ name: "revoke_auth_sessions", args: { p_user: "auth-c1" } });
    expect(sms[0]).toMatch(/paused/);
    expect(db.table("audit_events")[0]).toMatchObject({ action: "suspended customer", reason: "Reported stolen phone", target_id: "11111111-2222-4333-8444-555555555555" });
  });

  it("support can reset a password but not suspend", async () => {
    expect((await call({ customerId: "11111111-2222-4333-8444-555555555555", action: "suspend", reason: "because" }, "tok-support")).status).toBe(403);
    const res = await call({ customerId: "11111111-2222-4333-8444-555555555555", action: "reset_password", reason: "Caller confirmed date of birth" }, "tok-support");
    expect(res.status).toBe(200);
    expect(db.authUpdates[0].id).toBe("auth-c1");
    expect(String(db.authUpdates[0].attributes.password)).toHaveLength(64);
    expect(sms[0]).toMatch(/Forgot password/);
  });

  it("reactivation is only from suspended, never a way round a rejection", async () => {
    db.table("customers")[0].status = "rejected";
    expect((await call({ customerId: "11111111-2222-4333-8444-555555555555", action: "reactivate", reason: "Looks fine now" })).body.code).toBe("NOT_SUSPENDED");
  });
});

describe("the database side", () => {
  const sql = read("supabase/migrations/20261003110000_customers_and_signups.sql");

  it("agents only see the people they registered", () => {
    expect(sql).toMatch(/v_role <> 'agent' OR c\.registered_by = auth\.uid\(\)/);
    expect(sql).toMatch(/v_role = 'agent' AND c\.registered_by IS DISTINCT FROM auth\.uid\(\)/);
  });

  it("the profile never returns the full NIN, BVN or a template", () => {
    const detail = sql.slice(sql.indexOf("FUNCTION public.staff_customer_detail"), sql.indexOf("-- ── Sign-ups"));
    // has_face_template / has_palm_template (yes/no) are fine; the templates are not.
    expect(detail).not.toMatch(/'nin', c\.nin\b|c\.bvn\b|palm_vein_template|(?<![a-z_])face_template|pin_hash/);
  });

  it("ending sessions is for the server only", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_auth_sessions\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });
});
