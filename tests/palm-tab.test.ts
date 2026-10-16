import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PALM_STEPS,
  enrolledLine,
  nextPalmAccount,
  palmChip,
  palmFromRpc,
  palmHeroLine,
  palmStatusTitle,
  palmToday,
} from "../mobile-app/src/lib/palmView";

/**
 * The Palm tab (redesign phase 7): pause palm payments and choose the account
 * they come from — enforced where palm money moves, not just drawn.
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = read("supabase/migrations/20261001120000_palm_controls.sql");
// The checkout both process-payment and the POS terminal's `pos` function use.
const PAYMENT = read("supabase/functions/_shared/palm-checkout.ts");

describe("what the Palm tab says", () => {
  it("in the design's words", () => {
    const on = { hasPalm: true, paused: false };
    const off = { hasPalm: true, paused: true };
    expect(palmChip(on)).toEqual({ label: "Active", tone: "brand" });
    expect(palmChip(off)).toEqual({ label: "Paused", tone: "warn" });
    expect(palmStatusTitle(on)).toBe("Your palm is ready to pay");
    expect(palmStatusTitle(off)).toBe("Palm paused");
    expect(palmHeroLine(on)).toBe("Pay at any MiliPay terminal with your open hand. No phone, card or PIN needed.");
    expect(palmHeroLine(off)).toMatch(/^Palm payments are paused\. Terminals will decline your palm/);
    expect(PALM_STEPS.map((s) => s.text)).toEqual([
      "Hold your open palm over the scanner",
      "Check the amount on the screen",
      "Paid. We send you an alert",
    ]);
  });

  it("no palm on file is said plainly, not drawn as active", () => {
    const none = { hasPalm: false, paused: false };
    expect(palmChip(none).label).toBe("Not set up");
    expect(palmStatusTitle(none)).toBe("No palm on file yet");
  });

  it("enrolment line: only what is known", () => {
    expect(enrolledLine("2026-09-12T10:00:00Z", "Yaba Hub")).toBe("Enrolled Sep 12, 2026 · Agent: Yaba Hub");
    expect(enrolledLine("2026-09-12T10:00:00Z", null)).toBe("Enrolled Sep 12, 2026");
    expect(enrolledLine(null, null)).toBe("");
  });

  it("today's palm spending against the daily limit", () => {
    expect(palmToday(12450, 50000)).toEqual({ label: "₦12,450 of ₦50,000", pct: 24.9 });
    expect(palmToday(80000, 50000).pct).toBe(100);
    expect(palmToday(0, 0).pct).toBe(0);
  });

  it("Change moves to the next account, as the prototype cycles", () => {
    const a = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(nextPalmAccount(a, "a")?.id).toBe("b");
    expect(nextPalmAccount(a, "c")?.id).toBe("a");
    expect(nextPalmAccount(a, null)?.id).toBe("a");
    expect(nextPalmAccount([{ id: "a" }], "a")).toBeNull();
  });

  it("reads the server's answer", () => {
    expect(palmFromRpc({ found: false })).toBeNull();
    expect(
      palmFromRpc({ found: true, hasPalm: true, paused: true, spentToday: "1200.50", account: { id: "x", bankName: "GTBank", last4: "6789" } }),
    ).toMatchObject({ paused: true, spentToday: 1200.5, account: { id: "x", bankName: "GTBank", last4: "6789" } });
  });
});

describe("enforced where palm money moves", () => {
  it("a paused palm is declined before anything is recorded", () => {
    const paused = PAYMENT.indexOf("if (palmSettings.palm_paused)");
    const ledger = PAYMENT.indexOf('admin.from("transactions").insert(');
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(ledger);
    expect(PAYMENT).toMatch(/"PALM_PAUSED"/);
  });

  it("an unreadable setting declines rather than letting the payment through", () => {
    expect(PAYMENT).toMatch(/if \(palmError \|\| !palmSettings\) \{[\s\S]*?throw new ApiError/);
  });

  it("the account is the customer's choice, not the terminal's", () => {
    expect(PAYMENT).toMatch(/admin\.rpc\("palm_account_for", \{ p_customer_id: profile\.id \}\)/);
    expect(PAYMENT).toMatch(/account_used: \(typeof palmAccountId === "string" \? palmAccountId : null\)/);
    expect(PAYMENT).not.toMatch(/account_used: body\.accountId/);
  });
});

describe("the database rules", () => {
  it("a customer can only pick their own active account", () => {
    expect(MIGRATION).toMatch(/WHERE id = p_account_id AND user_id = v_uid AND is_active/);
  });

  it("the account resolver is the server's alone", () => {
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.palm_account_for\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it("signed-out callers get nothing", () => {
    for (const fn of ["get_my_palm()", "set_palm_paused(boolean)", "set_palm_account(uuid)"]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
    }
  });

  it("every change lands in the inbox", () => {
    expect(MIGRATION).toMatch(/AFTER UPDATE OF palm_paused, palm_account_id ON public\.customers/);
    expect(MIGRATION).toMatch(/'palm', 'Palm payments paused'/);
    expect(MIGRATION).toMatch(/'palm', 'Palm payments account changed'/);
  });
});

describe("the app", () => {
  it("pause and account changes go through the server and show its answer", () => {
    const store = read("mobile-app/src/store/useStore.ts");
    const palm = store.slice(store.indexOf("export const usePalmStore"));
    expect(palm).toMatch(/supabase\.rpc\('set_palm_paused', \{ p_paused: paused \}\)/);
    expect(palm).toMatch(/supabase\.rpc\('set_palm_account', \{ p_account_id: accountId \}\)/);
    // A failed pause is put back, not left showing as done.
    expect(palm).toMatch(/if \(error\) \{\s*set\(\{ palm: before \}\);/);
  });

  it("signing out clears it", () => {
    const store = read("mobile-app/src/store/useStore.ts");
    const logout = store.slice(store.indexOf("logout: async () => {"), store.indexOf("updateProfile: async"));
    expect(logout).toMatch(/usePalmStore\.setState\(\{ palm: null \}\)/);
  });
});
