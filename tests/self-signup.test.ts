import { createHmac } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  evaluateSmile,
  namesMatch,
  stepNumber,
  validAddress,
  validDob,
  validNin,
} from "../supabase/functions/_shared/signup";

/**
 * Self sign-up (Tier 1), run for real: the signup and smile-webhook Edge
 * Functions imported and called with real Requests, the database in memory,
 * Termii and Smile ID stood in for at fetch.
 *
 * What matters: a taken number or NIN gets nowhere; nothing after the phone
 * works without the resume token; a name is shown only after the selfie
 * matched; only a correctly signed Smile ID result counts, and only for the
 * NIN and birthday that were typed; three failed selfies go to a person; the
 * account is Tier 1, self-registered, and has no password until they make one.
 */

const PARTNER = "1234";
const API_KEY = "smile-key-fixture"; // secret-scan: allow — fake fixture, not a credential
const ENV: Record<string, string | undefined> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-fixture", // secret-scan: allow — fake fixture, not a credential
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
  TERMII_API_KEY: "termii-fixture", // secret-scan: allow — fake fixture, not a credential
  PASSWORD_DELIVERY_CHANNELS: "sms",
};

type Handler = (req: Request) => Promise<Response>;
let signup: Handler;
let webhook: Handler;
let db: FakeSupabase;
let sms: { to: string; code: string }[];
let smileTokenCalls: { url: string; headers: Record<string, string> }[];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/signup/index.ts");
  signup = (globalThis as any).__edgeHandler;
  await import("../supabase/functions/smile-webhook/index.ts");
  webhook = (globalThis as any).__edgeHandler;
  if (typeof signup !== "function" || typeof webhook !== "function" || signup === webhook) {
    throw new Error("functions did not register their handlers");
  }
});

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, BASE_ENV);
  db = new FakeSupabase(
    {
      customers: [{ id: "cust-old", phone: "08099999999", nin: "11111111111", status: "active" }],
      signup_sessions: [],
      smile_results: [],
    },
    { smile_results: ["job_id"] },
  );
  db.rpcAnswers.set("consume_rate_limit", () => true);
  (globalThis as any).__fakeSupabase = db;

  sms = [];
  smileTokenCalls = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.ng.termii.com/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sms.push({ to: body.to, code: String(body.sms).match(/\b(\d{6})\b/)![1] });
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }
    if (url.endsWith("/v3/token")) {
      smileTokenCalls.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ token: "smile-jwt" }), { status: 200 });
    }
    throw new Error(`unexpected outbound call to ${url}`);
  }) as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function call(body: Record<string, unknown>) {
  const res = await signup(
    new Request("https://project.supabase.test/functions/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

function signed(timestamp: string, key = API_KEY, partner = PARTNER) {
  return createHmac("sha256", key).update(`${timestamp}${partner}sid_request`).digest("base64");
}

async function deliver(payload: Record<string, unknown>, opts: { signature?: string } = {}) {
  const timestamp = "2026-10-02T10:00:00.000Z";
  const res = await webhook(
    new Request("https://project.supabase.test/functions/v1/smile-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Response-Timestamp": timestamp,
        "Response-Signature": opts.signature ?? signed(timestamp),
      },
      body: JSON.stringify(payload),
    }),
  );
  return res.status;
}

const NIN = "12345678901";
const DOB = "1994-03-14";
const clear = (jobId: string, over: Record<string, unknown> = {}) => ({
  status: "clear",
  product: "biometric_kyc",
  partner_params: { job_id: jobId, user_id: "u1" },
  id_fields: {
    first_name: "Adaeze",
    last_name: "Okafor",
    other_names: "Chioma",
    full_name: "Adaeze Chioma Okafor",
    id_number: NIN,
    date_of_birth: DOB,
    gender: "Female",
    photo_url: "https://smile-results.example/photo.jpg",
    ...over,
  },
});

/** Phone and code done: returns the session id and resume token. */
async function verifiedSession(phone = "08031234567") {
  const started = await call({ action: "start", phone });
  expect(started.status).toBe(200);
  const done = await call({ action: "verify_phone", sessionId: started.body.sessionId, code: sms[sms.length - 1].code });
  expect(done.status).toBe(200);
  return { sessionId: done.body.sessionId as string, token: done.body.token as string };
}

async function atSelfie() {
  const auth = await verifiedSession();
  const r = await call({ action: "nin", ...auth, nin: NIN, dateOfBirth: DOB, consent: true });
  expect(r.body.step).toBe("selfie");
  return auth;
}

function smileOn() {
  ENV.SMILE_PARTNER_ID = PARTNER;
  ENV.SMILE_API_KEY = API_KEY;
}

describe("the whole sign-up", () => {
  it("phone, code, NIN, selfie, is this you, address → a Tier 1 account and a way in", async () => {
    smileOn();
    const started = await call({ action: "start", phone: "0803 123 4567" });
    expect(started.body).toMatchObject({ success: true, sentTo: "+234 803 123 4567" });
    expect(sms.map((s) => s.to)).toEqual(["2348031234567"]);

    const verified = await call({ action: "verify_phone", sessionId: started.body.sessionId, code: sms[0].code });
    expect(verified.body).toMatchObject({ success: true, step: "nin" });
    const auth = { sessionId: verified.body.sessionId, token: verified.body.token };

    const ninStep = await call({ action: "nin", ...auth, nin: "1234 567 8901", dateOfBirth: DOB, consent: true });
    expect(ninStep.body).toMatchObject({ step: "selfie", stepNumber: 3 });
    // No name for a NIN alone.
    expect(ninStep.body.person).toBeNull();

    const token = await call({ action: "smile_token", ...auth });
    expect(token.body).toMatchObject({
      token: "smile-jwt",
      sandbox: true,
      callbackUrl: "https://project.supabase.test/functions/v1/smile-webhook",
      idInfo: { country: "NG", idType: "NIN_V2", idNumber: NIN },
    });
    // The API key went to Smile ID's sandbox and nowhere else.
    expect(smileTokenCalls[0].url).toBe("https://testapi.smileidentity.com/v3/token");
    expect(JSON.stringify(token.body)).not.toContain(API_KEY);

    const submitted = await call({ action: "selfie", ...auth, jobId: "job_1" });
    expect(submitted.body).toMatchObject({ step: "selfie", pending: true });

    expect(await deliver(clear("job_1"))).toBe(200);
    const matched = await call({ action: "selfie_status", ...auth });
    expect(matched.body).toMatchObject({
      step: "confirm",
      person: { fullName: "Adaeze Chioma Okafor", dateOfBirth: DOB, ninMasked: "•••• ••• 8901" },
    });

    expect((await call({ action: "confirm", ...auth })).body.step).toBe("addr");

    const done = await call({
      action: "address",
      ...auth,
      state: "Lagos",
      lga: "Ikeja",
      street: "14 Admiralty Way",
      landmark: "Opposite Mega Plaza",
    });
    expect(done.body).toMatchObject({ success: true, step: "done" });
    expect(done.body.tokenHash).toBe(db.generatedLinks[0].token);

    // No password on the identity: they make one next.
    expect(db.createdUsers[0].attributes).not.toHaveProperty("password");
    expect(db.createdUsers[0].attributes).toMatchObject({ phone: "+2348031234567", email: "08031234567@customer.milipay.ng" });
    const customer = db.table("customers").find((c) => c.phone === "08031234567")!;
    expect(customer).toMatchObject({
      first_name: "Adaeze",
      last_name: "Okafor",
      nin: NIN,
      nin_last_4: "8901",
      nin_verified: true,
      date_of_birth: DOB,
      gender: "female",
      kyc_tier: 1,
      status: "active",
      signup_source: "self",
      must_change_password: true,
      state: "Lagos",
      lga: "Ikeja",
      address: "14 Admiralty Way, Ikeja, Lagos",
    });
  });
});

describe("who can't get in", () => {
  it("a number that already has an account gets no code", async () => {
    const res = await call({ action: "start", phone: "08099999999" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This number already has a MiliPay account.");
    expect(sms).toEqual([]);
  });

  it("a NIN that already has an account goes no further", async () => {
    const auth = await verifiedSession();
    const res = await call({ action: "nin", ...auth, nin: "11111111111", dateOfBirth: DOB, consent: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This NIN already has a MiliPay account.");
  });

  it("no consent, or under 18, is refused", async () => {
    const auth = await verifiedSession();
    expect((await call({ action: "nin", ...auth, nin: NIN, dateOfBirth: DOB, consent: false })).status).toBe(400);
    const young = await call({ action: "nin", ...auth, nin: NIN, dateOfBirth: "2015-01-01", consent: true });
    expect(young.body.error).toMatch(/18 or older/);
  });

  it("nothing after the phone works without the resume token", async () => {
    const auth = await verifiedSession();
    const res = await call({ action: "nin", sessionId: auth.sessionId, token: "guess", nin: NIN, dateOfBirth: DOB, consent: true });
    expect(res.status).toBe(401);
  });

  it("a wrong code runs out", async () => {
    const started = await call({ action: "start", phone: "08031234567" });
    const wrong = String((Number(sms[0].code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 4; i++) {
      expect((await call({ action: "verify_phone", sessionId: started.body.sessionId, code: wrong })).status).toBe(400);
    }
    expect((await call({ action: "verify_phone", sessionId: started.body.sessionId, code: wrong })).status).toBe(410);
  });
});

describe("the selfie", () => {
  it("isn't available until Smile ID keys are set", async () => {
    const auth = await atSelfie();
    const res = await call({ action: "smile_token", ...auth });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SMILE_NOT_CONFIGURED");
  });

  it("only a correctly signed Smile ID result is kept", async () => {
    smileOn();
    expect(await deliver(clear("job_x"), { signature: signed("2026-10-02T10:00:00.000Z", "wrong-key") })).toBe(401);
    expect(db.table("smile_results")).toEqual([]);
  });

  it("the webhook refuses everything while Smile ID isn't configured", async () => {
    expect(await deliver(clear("job_x"))).toBe(503);
    expect(db.table("smile_results")).toEqual([]);
  });

  it("a clear result for another NIN, or another birthday, is not a match", async () => {
    smileOn();
    const auth = await atSelfie();
    await call({ action: "selfie", ...auth, jobId: "job_a" });
    await deliver(clear("job_a", { id_number: "99999999999" }));
    const other = await call({ action: "selfie_status", ...auth });
    expect(other.body).toMatchObject({ step: "selfie", selfie: { failure: "nin-mismatch", attemptsLeft: 2 } });
    expect(other.body.person).toBeNull();

    await call({ action: "selfie", ...auth, jobId: "job_b" });
    await deliver(clear("job_b", { date_of_birth: "1990-01-01" }));
    const birthday = await call({ action: "selfie_status", ...auth });
    expect(birthday.body.selfie).toMatchObject({ failure: "nin-mismatch", attemptsLeft: 1, failureText: "Your NIN details didn't match." });
  });

  it("three failed selfies go to a person", async () => {
    smileOn();
    const auth = await atSelfie();
    for (const [i, job] of ["j1", "j2", "j3"].entries()) {
      await call({ action: "selfie", ...auth, jobId: job });
      await deliver({ status: "block", reason: "face_not_matching", partner_params: { job_id: job } });
      const r = await call({ action: "selfie_status", ...auth });
      expect(r.body.step).toBe(i < 2 ? "selfie" : "review");
    }
    // And nothing more can be done with it from the app.
    expect((await call({ action: "confirm", ...auth })).body.code).toBe("IN_REVIEW");
  });

  it("a flagged check goes straight to a person", async () => {
    smileOn();
    const auth = await atSelfie();
    await call({ action: "selfie", ...auth, jobId: "jf" });
    await deliver({ status: "attention", partner_params: { job_id: "jf" } });
    expect((await call({ action: "selfie_status", ...auth })).body.step).toBe("review");
  });

  it("a result that arrives before the app reports its job still counts", async () => {
    smileOn();
    const auth = await atSelfie();
    await deliver(clear("early"));
    const r = await call({ action: "selfie", ...auth, jobId: "early" });
    expect(r.body.step).toBe("confirm");
  });

  it("can't skip to the address before the selfie matched", async () => {
    const auth = await atSelfie();
    const r = await call({ action: "address", ...auth, state: "Lagos", lga: "Ikeja", street: "14 Admiralty Way" });
    expect(r.status).toBe(409);
    expect(db.createdUsers).toEqual([]);
  });
});

describe("the rules", () => {
  it("steps", () => {
    expect(["phone", "nin", "selfie", "confirm", "addr", "done"].map((s) => stepNumber(s as any))).toEqual([1, 2, 3, 3, 4, 5]);
    expect(validNin("1234 567 8901")).toBe("12345678901");
    expect(validNin("123")).toBeNull();
  });

  it("date of birth", () => {
    const now = new Date("2026-10-02T00:00:00Z");
    expect(validDob("2008-10-02", now)).toEqual({ ok: true, dob: "2008-10-02" });
    expect(validDob("2008-10-03", now).ok).toBe(false);
    expect(validDob("1994-02-30", now).ok).toBe(false);
  });

  it("address", () => {
    expect(validAddress({ state: "Lagos", lga: "Ikeja", street: "14 Admiralty Way" }).ok).toBe(true);
    expect(validAddress({ state: "Atlantis", lga: "Ikeja", street: "14 Admiralty Way" }).ok).toBe(false);
    expect(validAddress({ state: "Lagos", lga: "Ikeja", street: "14" }).ok).toBe(false);
  });

  it("Smile ID verdicts", () => {
    const expected = { nin: NIN, dob: DOB };
    expect(evaluateSmile(clear("j"), expected).kind).toBe("match");
    expect(evaluateSmile({ status: "attention" }, expected)).toEqual({ kind: "review", reason: "flagged" });
    expect(evaluateSmile({ status: "block", reason: "spoof_detected" }, expected).kind).toBe("review");
    expect(evaluateSmile({ status: "block", reason: "identifier_not_found" }, expected)).toMatchObject({ failKind: "nin-mismatch" });
    expect(evaluateSmile({ status: "block", reason: "face_not_matching" }, expected)).toMatchObject({ failKind: "face-unclear", counts: true });
    expect(evaluateSmile({ status: "error" }, expected)).toMatchObject({ counts: false });
  });

  it("bank account names, in any order", () => {
    const p = { firstName: "Adaeze", lastName: "Okafor", otherNames: "Chioma" };
    expect(namesMatch(p, "OKAFOR ADAEZE C.")).toBe(true);
    expect(namesMatch(p, "Okafor Chioma")).toBe(true);
    expect(namesMatch(p, "John Doe")).toBe(false);
    expect(namesMatch(p, "Adaeze Nwosu")).toBe(false);
  });
});
