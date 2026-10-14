import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { fillReply, signupRef as clientSignupRef, slaOf, SLA } from "../packages/shared/src/features/support/desk";
import { summarise } from "../packages/shared/src/features/support/DeskContext";
import { queueLists } from "../packages/shared/src/pages/complaints/ComplaintsDesk";
import { matchesFilter } from "../packages/shared/src/pages/dashboard/AdminSupportPage";
import { durationLabel, slowBanner } from "../packages/shared/src/pages/dashboard/SupportDashboard";
import {
  APPLICANT_ACTIONS,
  CUSTOMER_ACTIONS,
  deskLine,
  nearestAgentsSms,
  noteRequired,
  signupRef as serverSignupRef,
} from "../supabase/functions/_shared/support-desk";

/**
 * Portal redesign, step 7: the support portal. The desk's SLA clock, the
 * queue's tabs, saved replies, what the customer can and can't see, refund
 * requests that only an admin can turn into money, and the account help
 * support gives (audited, and written to the ticket).
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL = read("supabase/migrations/20261005090000_support_desk.sql");
const fn = (name: string) => {
  const body = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`));
  return body.slice(0, body.indexOf("$$;"));
};

const MIN = 60_000;
const t0 = Date.parse("2026-10-05T09:00:00Z");
const ticket = (o: Partial<Parameters<typeof slaOf>[0]> = {}) => ({
  urgency: "critical" as const,
  status: "open" as const,
  createdAt: new Date(t0).toISOString(),
  firstRepliedAt: null,
  ...o,
});

describe("SLA clock", () => {
  it("follows the policy: first reply, then resolve, from when it was opened", () => {
    expect(SLA).toEqual({ critical: [5, 60], high: [15, 240], medium: [60, 480], low: [240, 1440] });
    const s = slaOf(ticket(), t0 + 2 * MIN);
    expect(s).toMatchObject({ tone: "ok", first: true, label: "3:00", text: "First reply due in 3:00" });
    expect(s.policy).toBe("Critical · reply 5m · resolve 1h");
    // Answered: the resolve clock takes over.
    expect(slaOf(ticket({ firstRepliedAt: new Date(t0 + MIN).toISOString() }), t0 + 10 * MIN).text).toBe("Resolve due in 50:00");
  });

  it("warns in the last 25%, fails when overdue, and is muted once solved", () => {
    expect(slaOf(ticket(), t0 + 4 * MIN).tone).toBe("warn");
    const late = slaOf(ticket(), t0 + 7 * MIN);
    expect(late).toMatchObject({ tone: "fail", label: "-2:00", text: "First reply overdue by 2:00", pct: 100 });
    expect(slaOf(ticket({ urgency: "low" }), t0 + 26 * 60 * MIN).label).toMatch(/^-\d+h/);
    expect(slaOf(ticket({ status: "resolved" }), t0 + 99 * MIN)).toMatchObject({ tone: "muted", label: "Solved" });
  });

  it("the header counts overdue, at risk and new from open tickets only", () => {
    const now = t0 + 4.5 * MIN;
    const rows = [
      { ...ticket(), assignedTo: null },
      { ...ticket({ createdAt: new Date(t0 - 10 * MIN).toISOString() }), assignedTo: "me" },
      { ...ticket({ status: "resolved", createdAt: new Date(t0 - 100 * MIN).toISOString() }), assignedTo: null },
    ] as any[];
    expect(summarise(rows, now)).toEqual({ overdue: 1, risk: 1, unassigned: 1 });
  });
});

describe("queue and replies", () => {
  const rows = [
    { id: "a", status: "open", assignedTo: null, escalated: false },
    { id: "b", status: "in_progress", assignedTo: "me", escalated: true },
    { id: "c", status: "in_progress", assignedTo: "other", escalated: false },
    { id: "d", status: "resolved", assignedTo: "me", escalated: true },
  ] as any[];

  it("Mine / New / Open / Solved, as the design defines them", () => {
    const l = queueLists(rows, "me");
    expect(l.mine.map((t) => t.id)).toEqual(["b"]);
    expect(l.unassigned.map((t) => t.id)).toEqual(["a"]);
    expect(l.open.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(l.solved.map((t) => t.id)).toEqual(["d"]);
  });

  it("the admin page's filters; a solved ticket is no longer escalated", () => {
    expect(rows.filter((t) => matchesFilter(t, "escalated")).map((t) => t.id)).toEqual(["b"]);
    expect(rows.filter((t) => matchesFilter(t, "all"))).toHaveLength(4);
  });

  it("saved replies fill in what the ticket knows and leave the rest for the agent", () => {
    const body = "Hi {first}, your refund of {amount} has been sent to your {bank} account.";
    expect(fillReply(body, { first: "Adaeze", amount: "₦5,000", bank: "GTBank" })).toBe(
      "Hi Adaeze, your refund of ₦5,000 has been sent to your GTBank account.",
    );
    expect(fillReply(body, { first: "Adaeze" })).toContain("{amount}");
  });

  it("dashboard words", () => {
    expect(durationLabel(220)).toBe("3m 40s");
    expect(durationLabel(null)).toBe("—");
    expect(slowBanner({ provider: "IKEDC", service: "power", pending: 4, oldestMinutes: 40 }).body).toMatch(
      /^Electricity tokens are taking up to 40 minutes \(4 waiting\)\. Use the "Payment still pending" reply/,
    );
  });

  it("a sign-up's short reference reads the same in the portal and on the server", () => {
    const id = "8f3e2a10-1b2c-4d5e-8f90-123456789abc";
    expect(clientSignupRef(id)).toBe("SUP-8F3E2A");
    expect(serverSignupRef(id)).toBe(clientSignupRef(id));
  });
});

describe("what the customer can see, and who can do what", () => {
  it("the app reads only customer, staff and system lines; notes, calls and events stay with staff", () => {
    const policy = SQL.slice(SQL.indexOf('CREATE POLICY "Customers can view own messages"'));
    expect(policy.slice(0, policy.indexOf(");\n") + 3)).toMatch(/sender_type IN \('customer', 'staff', 'system'\)/);
    expect(SQL).toMatch(/CHECK \(sender_type IN \('customer', 'staff', 'system', 'note', 'call', 'event'\)\)/);
  });

  it("clients can no longer write the new ticket columns, edit messages or truncate", () => {
    expect(SQL).toMatch(/REVOKE INSERT, UPDATE, TRUNCATE ON public\.support_tickets FROM anon, authenticated;/);
    const insertGrant = SQL.slice(SQL.indexOf("GRANT INSERT (customer_id"), SQL.indexOf("ON public.support_tickets TO authenticated;"));
    for (const col of ["channel", "signup_session_id", "contact_phone", "first_replied_at", "staff_seen_at"]) {
      expect(insertGrant).not.toContain(col);
    }
    expect(SQL).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.ticket_messages FROM anon, authenticated;/);
    expect(SQL).toMatch(/GRANT INSERT \(ticket_id, sender_id, sender_type, content\) ON public\.ticket_messages TO authenticated;/);
  });

  it("every desk function checks for support or an admin, and none is open to the public", () => {
    for (const name of [
      "support_inbox", "support_ticket_thread", "support_mark_seen", "support_ticket_action", "support_post",
      "support_handover", "support_request_refund", "support_create_ticket", "support_set_presence", "support_people",
      "support_applicant", "support_customer_payments", "support_today", "support_calls", "support_saved_replies", "support_use_reply",
    ]) {
      expect(fn(name), name).toMatch(/assert_staff\(ARRAY\['support', 'admin', 'super_admin'\]\)/);
      expect(SQL, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`));
    }
    for (const name of ["admin_refund_requests", "admin_decide_refund_request"]) expect(fn(name)).toMatch(/assert_admin\(\)/);
    // Helpers that write as the caller are not callable at all.
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.support_line\(uuid, text, text, jsonb\) FROM PUBLIC, anon, authenticated;/);
  });

  it("support can only ask for a refund: refundable states match the admin's, and an admin decides through the state machine", () => {
    const refundable = fn("refundable_status").match(/IN \(([^)]*)\)/)![1];
    const admin = read("supabase/migrations/20261003100000_transactions_operations_audit.sql");
    expect(admin).toContain(`IF v_status NOT IN (${refundable}) THEN`);
    const request = fn("support_request_refund");
    expect(request).not.toMatch(/UPDATE public\.transactions|refund_queue/);
    expect(request).toMatch(/log_audit_event\('Support', 'requested refund'/);
    expect(request).toMatch(/customer_id = k\.customer_id/);
    const decide = fn("admin_decide_refund_request");
    expect(decide).toMatch(/admin_resolve_transaction\(r\.reference, 'refund'/);
    expect(decide).toMatch(/log_audit_event\('Transactions', 'declined refund request'/);
  });

  it("a handover needs a note, goes to an online or away support agent, and is audited", () => {
    const h = fn("support_handover");
    expect(h).toMatch(/length\(v_note\) < 3/);
    expect(h).toMatch(/role = 'support'/);
    expect(h).toMatch(/presence_of\(v_to\.id\) = 'offline'/);
    expect(h).toMatch(/log_audit_event\('Support', 'handed over ticket'/);
  });

  it("the first staff reply stops the first-reply clock", () => {
    expect(fn("touch_ticket_on_message")).toMatch(/WHEN NEW\.sender_type = 'staff' THEN coalesce\(first_replied_at, NEW\.created_at\)/);
  });

  it("the sign-up function keeps which account holds a refused NIN, never the NIN", () => {
    const signup = read("supabase/functions/signup/index.ts");
    expect(signup).toMatch(/nin_blocked_at: new Date\(\)\.toISOString\(\), nin_blocked_customer_id: holder/);
  });
});

describe("account help rules", () => {
  it("each person gets the right actions, and every one but sending agents needs a note", () => {
    expect(CUSTOMER_ACTIONS).toEqual(["reset_link", "login_code", "nearest_agents"]);
    expect(APPLICANT_ACTIONS).toEqual(["signup_priority", "nin_misuse", "signup_code", "nearest_agents"]);
    expect(noteRequired("nearest_agents")).toBe(false);
    expect(noteRequired("reset_link")).toBe(true);
  });

  it("the agent SMS lists at most three", () => {
    const sms = nearestAgentsSms("Lagos", [
      { name: "Bola Ahmed", phone: "08031234567" },
      { name: "Tolu Ade", phone: null },
      { name: "Ngozi Eze", phone: "08051234567" },
      { name: "Fourth Agent", phone: "08061234567" },
    ]);
    expect(sms).toMatch(/^MiliPay agents in Lagos: Bola Ahmed \(08031234567\); Tolu Ade; Ngozi Eze \(08051234567\)\./);
    expect(sms).not.toContain("Fourth");
    expect(deskLine("login_code", { phone: "0803", staff: "Samuel Okon" })).toBe("Login code sent to 0803 by Samuel Okon");
  });
});

// ── support-desk, run for real ────────────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let desk: (req: Request) => Promise<Response>;
let db: FakeSupabase;
let sent: string[];

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/support-desk/index.ts");
  desk = (globalThis as any).__edgeHandler;
});

const ME = "33333333-3333-4333-8333-333333333333";
const CUST = "44444444-4444-4444-8444-444444444444";
const SIGNUP = "55555555-5555-4555-8555-555555555555";
const TICKET = "66666666-6666-4666-8666-666666666666";
const HOLDER = "77777777-7777-4777-8777-777777777777";

async function call(body: Record<string, unknown>, token = "tok-support") {
  const res = await desk(
    new Request("https://project.supabase.test/functions/v1/support-desk", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe("support-desk", () => {
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
        { id: ME, role: "support", full_name: "Samuel Okon", status: "active" },
        { id: "agent-1", role: "agent", full_name: "Bola Ahmed", phone: "08031234567", state: "Lagos", status: "active" },
        { id: "agent-2", role: "agent", full_name: "Kemi Ola", phone: "08041234567", state: "Kano", status: "active" },
      ],
      customers: [
        { id: CUST, first_name: "Adaeze", last_name: "Okafor", phone: "08031230000", state: "Lagos", status: "active", auth_user_id: "auth-1", kyc_tier: 1 },
      ],
      login_codes: [],
      signup_sessions: [
        { id: SIGNUP, phone: "08032004100", step: "nin", state: "Lagos", phone_verified_at: "2026-10-05T08:00:00Z", code_resends: 0, nin_blocked_at: "2026-10-05T08:10:00Z", nin_blocked_customer_id: HOLDER },
      ],
      fraud_reports: [],
      ticket_messages: [],
      audit_events: [],
    });
    db.users.set("tok-support", { id: ME });
    db.users.set("tok-agent", { id: "agent-1" });
    db.rpcAnswers.set("consume_rate_limit", () => true);
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

  it("is for support and admins only", async () => {
    expect((await call({ action: "nearest_agents", customerId: CUST }, "tok-agent")).status).toBe(403);
  });

  it("needs a note on how they were confirmed", async () => {
    const res = await call({ action: "reset_link", customerId: CUST, note: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOTE_REQUIRED");
  });

  it("refuses an action that doesn't fit the person", async () => {
    expect((await call({ action: "signup_code", customerId: CUST, note: "Asked for it" })).body.code).toBe("WRONG_PERSON");
  });

  it("a password reset texts the in-app steps, goes on the audit log and onto the ticket", async () => {
    const res = await call({ action: "reset_link", customerId: CUST, ticketId: TICKET, note: "Confirmed DOB and last payment" });
    expect(res.status).toBe(200);
    expect(sent[0]).toMatch(/Me › Change password/);
    expect(db.table("audit_events")[0]).toMatchObject({ category: "Support", action: "sent a password reset to", target_id: CUST });
    const lines = db.table("ticket_messages");
    expect(lines.map((l) => l.sender_type)).toEqual(["event", "note"]);
    expect(lines[0].content).toBe("Password reset sent to 08031230000 by Samuel Okon");
  });

  it("a login code only replaces one for a sign-in they started", async () => {
    expect((await call({ action: "login_code", customerId: CUST, note: "Confirmed DOB" })).body.code).toBe("NO_SIGN_IN");
    db.table("login_codes").push({
      id: "lc-1", customer_id: CUST, phone: "08031230000", resends: 0, consumed_at: null, cancelled_at: null, code_verified_at: null,
      expires_at: "2999-01-01T00:00:00Z",
    });
    const res = await call({ action: "login_code", customerId: CUST, note: "Confirmed DOB" });
    expect(res.status).toBe(200);
    const row = db.table("login_codes")[0];
    expect(row.resends).toBe(1);
    expect(String(row.code_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(sent.some((m) => /login code is \d{6}/.test(m))).toBe(true);
  });

  it("nearest agents are the agents in their state, and need no note", async () => {
    const res = await call({ action: "nearest_agents", customerId: CUST });
    expect(res.status).toBe(200);
    expect(sent[0]).toMatch(/MiliPay agents in Lagos: Bola Ahmed \(08031234567\)/);
    expect(sent[0]).not.toContain("Kemi");
  });

  it("a NIN refused at sign-up can be reported once; the applicant gets a text", async () => {
    const res = await call({ action: "nin_misuse", signupId: SIGNUP, ticketId: TICKET, note: "Confirmed with their NIN slip" });
    expect(res.status).toBe(200);
    expect(db.table("fraud_reports")[0]).toMatchObject({ signup_session_id: SIGNUP, customer_id: HOLDER, reported_by: ME, ticket_id: TICKET });
    expect(db.table("audit_events")[0]).toMatchObject({ category: "Sign-ups", action: "reported possible NIN misuse for sign-up" });
    expect(sent[0]).toMatch(/fraud check/);
  });

  it("priority is only for a sign-up waiting for review; a sign-up code only before the phone is verified", async () => {
    expect((await call({ action: "signup_priority", signupId: SIGNUP, note: "Needs to pay a bill today" })).body.code).toBe("NOT_IN_REVIEW");
    expect((await call({ action: "signup_code", signupId: SIGNUP, note: "Code expired" })).body.code).toBe("PHONE_VERIFIED");
    db.table("signup_sessions")[0].step = "review";
    expect((await call({ action: "signup_priority", signupId: SIGNUP, note: "Needs to pay a bill today" })).status).toBe(200);
    expect(db.table("signup_sessions")[0]).toMatchObject({ priority_by: ME, priority_note: "Needs to pay a bill today" });
  });
});
