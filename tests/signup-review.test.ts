import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { reviewSms, reviewSummary } from "../supabase/functions/_shared/signup";

/**
 * Admin › Customers › Sign-up reviews, run for real: the signup-review Edge
 * Function imported, the database in memory, Termii stood in for at fetch.
 *
 * What matters: administrators only; approving needs NIMC's own record for
 * the NIN and birthday typed (a reviewer overrules a flag, never invents an
 * identity); one decision per sign-up; the customer is texted; and the app
 * keeps the sign-up so they can carry on.
 */

const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  PASSWORD_DELIVERY_CHANNELS: "sms",
};
const NIN = "12345678901";
const DOB = "1994-03-14";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;
let db: FakeSupabase;
let sms: { to: string; text: string }[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/signup-review/index.ts");
  handler = (globalThis as any).__edgeHandler;
});

const result = (jobId: string, over: Record<string, unknown> = {}) => ({
  job_id: jobId,
  payload: {
    status: "attention",
    reason: "high_risk",
    partner_params: { job_id: jobId },
    image_links: { selfie_image: "https://smile.example/selfie.jpg" },
    antifraud: { fraud_risk: { risk_level: "medium" } },
    id_fields: {
      first_name: "Adaeze",
      last_name: "Okafor",
      full_name: "Adaeze Okafor",
      id_number: NIN,
      date_of_birth: DOB,
      gender: "Female",
      photo_url: "https://smile.example/photo.jpg",
      ...over,
    },
  },
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase({
    staff_profiles: [{ id: "admin-1", role: "admin" }, { id: "support-1", role: "support" }],
    signup_sessions: [
      { id: "s-flagged", phone: "08031234567", step: "review", nin: NIN, date_of_birth: DOB, review_reason: "flagged", smile_job_id: "j1", selfie_attempts: 0, updated_at: "2026-10-02T10:00:00Z" },
      { id: "s-other", phone: "08055555555", step: "review", nin: NIN, date_of_birth: DOB, review_reason: "three_failed_selfies", smile_job_id: "j2", selfie_attempts: 3, updated_at: "2026-10-02T09:00:00Z" },
      { id: "s-done", phone: "08066666666", step: "confirm", nin: NIN, date_of_birth: DOB },
    ],
    smile_results: [result("j1"), result("j2", { id_number: "99999999999" })],
  });
  db.users.set("tok-admin", { id: "admin-1" });
  db.users.set("tok-support", { id: "support-1" });
  (globalThis as any).__fakeSupabase = db;
  sms = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.ng.termii.com/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sms.push({ to: body.to, text: body.sms });
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function call(body: Record<string, unknown>, token = "tok-admin") {
  const res = await handler(
    new Request("https://project.supabase.test/functions/v1/signup-review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const session = (id: string) => db.table("signup_sessions").find((s) => s.id === id)!;

describe("the list", () => {
  it("shows only sign-ups in review, with what Smile ID said", async () => {
    const res = await call({ action: "list" });
    expect(res.body.items.map((i: any) => i.id)).toEqual(["s-flagged", "s-other"]);
    expect(res.body.items[0]).toMatchObject({
      phone: "08031234567",
      ninLast4: "8901",
      smile: { fullName: "Adaeze Okafor", ninMatches: true, dobMatches: true, riskLevel: "medium", selfieUrl: "https://smile.example/selfie.jpg" },
    });
    expect(res.body.items[1].smile.ninMatches).toBe(false);
    // The full NIN never leaves the server.
    expect(JSON.stringify(res.body)).not.toContain(NIN);
  });

  it("administrators only", async () => {
    expect((await call({ action: "list" }, "tok-support")).status).toBe(403);
  });
});

describe("decisions", () => {
  it("approve: NIMC's record becomes theirs, they go on to 'Is this you?', and they are texted", async () => {
    const res = await call({ action: "decide", sessionId: "s-flagged", decision: "approve" });
    expect(res.body).toMatchObject({ success: true, customerTold: true });
    expect(session("s-flagged")).toMatchObject({
      step: "confirm",
      id_full_name: "Adaeze Okafor",
      id_gender: "female",
      reviewed_by: "admin-1",
    });
    expect(sms[0]).toMatchObject({ to: "2348031234567" });
    expect(sms[0].text).toMatch(/approved/);
  });

  it("approve is refused when the NIMC record is for another NIN", async () => {
    const res = await call({ action: "decide", sessionId: "s-other", decision: "approve" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOTHING_TO_APPROVE");
    expect(session("s-other").step).toBe("review");
    expect(sms).toEqual([]);
  });

  it("another try: three fresh attempts at the selfie", async () => {
    await call({ action: "decide", sessionId: "s-other", decision: "retry" });
    expect(session("s-other")).toMatchObject({ step: "selfie", selfie_attempts: 0, smile_job_id: null });
    expect(sms[0].text).toMatch(/clearer selfie/);
  });

  it("reject needs a reason, and the reason is what they are told", async () => {
    expect((await call({ action: "decide", sessionId: "s-other", decision: "reject" })).body.code).toBe("NO_REASON");
    await call({ action: "decide", sessionId: "s-other", decision: "reject", reason: "The selfie doesn't match the NIN photo" });
    expect(session("s-other").step).toBe("abandoned");
    expect(sms[0].text).toMatch(/Reason: The selfie doesn't match the NIN photo\./);
  });

  it("one decision per sign-up", async () => {
    await call({ action: "decide", sessionId: "s-flagged", decision: "retry" });
    const again = await call({ action: "decide", sessionId: "s-flagged", decision: "approve" });
    expect(again.status).toBe(409);
    expect((await call({ action: "decide", sessionId: "s-done", decision: "retry" })).status).toBe(409);
  });
});

describe("the rules and the app", () => {
  it("summary and messages", () => {
    expect(reviewSummary(null, { nin: NIN, dob: DOB })).toMatchObject({ ninMatches: false, fullName: null });
    expect(reviewSms("approve")).not.toMatch(/\d{4,}/);
  });

  it("the app keeps the sign-up during review, so 'Continue signing up' works after a decision", () => {
    const screen = readFileSync(join(__dirname, "..", "mobile-app/src/screens/auth/SignupScreen.tsx"), "utf8");
    expect(screen).toMatch(/if \(v\.step === 'review'\) return go\('review'\);/);
    const welcome = readFileSync(join(__dirname, "..", "mobile-app/src/screens/auth/WelcomeScreen.tsx"), "utf8");
    expect(welcome).toMatch(/A dropped connection is not a reason to forget it/);
  });
});
