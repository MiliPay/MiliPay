import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import {
  AGENT_FIELDS,
  MERCHANT_FIELDS,
  PHONE_ERROR,
  WAITLIST_ERROR,
  checkForm,
  formPhone,
  shownPhone,
  waitlistPhone,
} from "../supabase/functions/_shared/website";
import { FAQS, filterFaqs } from "../website/src/lib/content";

/**
 * The marketing website redesign (design_handoff_website): the waitlist while
 * the app isn't in the stores, the merchant and agent applications, the agent
 * list, and the FAQ search. The site and the `website` Edge Function share one
 * set of form rules, so these run against both.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("form rules", () => {
  it("phones: the waitlist sits after +234; forms take the full number", () => {
    expect(waitlistPhone("803 123 4567")).toBe("08031234567");
    expect(waitlistPhone("0803 123 4567")).toBe("08031234567");
    expect(waitlistPhone("603 123 4567")).toBeNull();
    expect(waitlistPhone("803 123 456")).toBeNull();
    expect(shownPhone("08031234567")).toBe("+234 803 123 4567");
    expect(formPhone("+234 803 123 4567")).toBe("08031234567");
    expect(formPhone("803 123 4567")).toBeNull();
  });

  it("speaks the design's words", () => {
    expect(WAITLIST_ERROR).toBe("Enter the 10 digits after +234.");
    const r = checkForm(MERCHANT_FIELDS, { phone: "123", email: "nope", type: "Bakery" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      biz: "Fill this in.",
      phone: PHONE_ERROR,
      email: "Enter a valid email address.",
      type: "Choose one.",
      bank: "Choose one.",
    });
  });

  it("a complete agent application comes back trimmed, with the phone as 0803…", () => {
    const r = checkForm(AGENT_FIELDS, {
      name: "  Bola   Ahmed ",
      phone: "0803 123 4567",
      email: "bola@example.com",
      state: "Lagos",
      area: "Yaba",
      place: "A kiosk",
    });
    expect(r).toEqual({
      ok: true,
      values: { name: "Bola Ahmed", phone: "08031234567", email: "bola@example.com", state: "Lagos", area: "Yaba", place: "A kiosk" },
    });
  });
});

describe("help page", () => {
  it("searches questions and answers within a category", () => {
    expect(FAQS).toHaveLength(13);
    expect(filterFaqs("All", "refund").map((f) => f.q)).toEqual(["My bill payment says pending. What happens now?"]);
    expect(filterFaqs("Security", "").every((f) => f.cat === "Security")).toBe(true);
    expect(filterFaqs("Business", "palm")).toHaveLength(0);
  });
});

describe("what the browser can reach", () => {
  const SQL = read("supabase/migrations/20261014100000_website_leads.sql");
  it("every website table is closed to clients; only the function writes", () => {
    for (const t of ["website_waitlist", "merchant_leads", "agent_applications", "agent_locations"]) {
      expect(SQL, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL, t).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated;`);
    }
    expect(SQL).not.toMatch(/CREATE POLICY/);
  });

  it("the public agent list is not staff records", () => {
    const fn = read("supabase/functions/website/index.ts");
    expect(fn).toMatch(/from\("agent_locations"\)/);
    expect(fn).not.toMatch(/staff_profiles/);
  });

  it("one launch flag drives the waitlist", () => {
    expect(read("website/src/lib/config.ts")).toMatch(/export const APP_LIVE = false;/);
    expect(read("website/src/components/site/DownloadBand.tsx")).toMatch(/MiliPay is coming to your phone\./);
  });
});

// ── website function, run for real ───────────────────────────────────────
const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let site: (req: Request) => Promise<Response>;
let db: FakeSupabase;

beforeAll(async () => {
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
  await import("../supabase/functions/website/index.ts");
  site = (globalThis as any).__edgeHandler;
});

async function call(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await site(
    new Request(`https://project.supabase.test/functions/v1/website/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

const MERCHANT = {
  biz: "Lekki Fresh Mart",
  rc: "RC1234567",
  type: "Supermarket",
  contact: "Adaeze Okafor",
  phone: "0803 123 4567",
  email: "Adaeze@LekkiFresh.ng",
  state: "Lagos",
  tills: "2 to 5",
  bank: "GTBank",
};

describe("website function", () => {
  let limited: boolean;
  beforeEach(() => {
    Object.assign(ENV, {
      SUPABASE_URL: "https://project.supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-fixture", // secret-scan: allow — fake fixture, not a credential
    });
    db = new FakeSupabase(
      {
        website_waitlist: [],
        merchant_leads: [],
        agent_applications: [],
        agent_locations: [
          { name: "Yaba Hub", address: "Herbert Macaulay Way, Yaba", state: "Lagos", hours: "8am–6pm", active: true },
          { name: "Closed Kiosk", address: "Somewhere", state: "Lagos", hours: null, active: false },
          { name: "Garki Hub", address: "Area 11, Garki", state: "FCT (Abuja)", hours: "9am–6pm", active: true },
        ],
      },
      { website_waitlist: ["phone"] },
    );
    limited = false;
    db.rpcAnswers.set("consume_rate_limit", () => !limited);
    (globalThis as any).__fakeSupabase = db;
    globalThis.fetch = vi.fn() as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("waitlist: refuses a bad number in the site's words, and keeps a number once", async () => {
    const bad = await call("waitlist", { phone: "12345" });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual({ phone: WAITLIST_ERROR });

    expect((await call("waitlist", { phone: "803 123 4567", page: "/" })).status).toBe(200);
    expect((await call("waitlist", { phone: "0803 123 4567", page: "/business" })).status).toBe(200);
    expect(db.table("website_waitlist")).toHaveLength(1);
    expect(db.table("website_waitlist")[0].phone).toBe("08031234567");
  });

  it("merchant application: checked like the form, stored in its own columns", async () => {
    const bad = await call("merchant-leads", { ...MERCHANT, bank: "Bank of Nowhere" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_FAILED");
    expect(bad.body.errors).toEqual({ bank: "Choose one." });

    expect((await call("merchant-leads", MERCHANT)).status).toBe(200);
    expect(db.table("merchant_leads")[0]).toMatchObject({
      business_name: "Lekki Fresh Mart",
      cac_number: "RC1234567",
      business_type: "Supermarket",
      contact_name: "Adaeze Okafor",
      phone: "08031234567",
      email: "adaeze@lekkifresh.ng",
      state: "Lagos",
      tills: "2 to 5",
      settlement_bank: "GTBank",
    });
  });

  it("agent application", async () => {
    const res = await call("agent-applications", {
      name: "Bola Ahmed",
      phone: "08051234567",
      email: "bola@example.com",
      state: "Oyo",
      area: "Bodija",
      place: "My own shop",
    });
    expect(res.status).toBe(200);
    expect(db.table("agent_applications")[0]).toMatchObject({ full_name: "Bola Ahmed", state: "Oyo", area: "Bodija", workplace: "My own shop" });
  });

  it("agents: published, active locations in the state asked for", async () => {
    expect((await call("agents?state=Atlantis")).status).toBe(400);
    const res = await call("agents?state=Lagos");
    expect(res.status).toBe(200);
    expect(res.body.agents.map((a: any) => a.name)).toEqual(["Yaba Hub"]);
  });

  it("is rate-limited per address, and knows only its own routes", async () => {
    limited = true;
    expect((await call("waitlist", { phone: "803 123 4567" })).status).toBe(429);
    expect(db.table("website_waitlist")).toHaveLength(0);
    limited = false;
    expect((await call("nope", {})).status).toBe(404);
    expect((await call("waitlist")).status).toBe(405);
  });
});
