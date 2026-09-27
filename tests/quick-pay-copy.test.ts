import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  missingDetailsMessage,
  paymentMethodLabel,
  quickPayCopy,
  type QuickPayAccountView,
  type QuickPayState,
} from "../mobile-app/src/lib/quickPayCopy";
import { quickPayState } from "../supabase/functions/_shared/quick-pay";

/**
 * What the app says about quick pay.
 *
 * The one rule that matters: the app never tells a customer quick pay is on
 * until the server — which only believes Mono's `ready` — says so. Until then
 * every purchase still asks their bank, and a screen that claimed otherwise
 * would be wrong at exactly the moment they are paying.
 */

const view = (state: QuickPayState, extra: Partial<QuickPayAccountView> = {}): QuickPayAccountView => ({
  linkedAccountId: "acct-1",
  state,
  allowance: null,
  remaining: null,
  bankApproved: false,
  failure: null,
  ...extra,
});

const ALL_STATES: QuickPayState[] = ["off", "setting_up", "on", "paused", "failed"];

describe("quickPayCopy", () => {
  it("says 'on' only when it is on", () => {
    for (const state of ALL_STATES) {
      const copy = quickPayCopy(view(state));
      if (state === "on") expect(copy.title).toMatch(/is on/i);
      else expect(copy.title, state).not.toMatch(/is on/i);
      expect(copy.tone === "ok", state).toBe(state === "on");
    }
    expect(paymentMethodLabel("on")).toBe("Quick pay");
    for (const state of ["off", "setting_up", "paused", "failed", null, undefined] as const) {
      expect(paymentMethodLabel(state as QuickPayState)).toBe("Approve at your bank");
    }
  });

  it("covers every state the server can report", () => {
    // Drive the server's own rule through each case, so a new server state
    // with no words here fails this test rather than showing a blank row.
    const now = new Date("2026-09-26T12:00:00Z");
    const produced = new Set<string>([
      quickPayState([], now).state,
      quickPayState([{ status: "active", created_at: "2026-09-26T10:00:00Z" }], now).state,
      quickPayState([{ status: "suspended", created_at: "2026-09-26T10:00:00Z" }], now).state,
      quickPayState([{ status: "pending", created_at: "2026-09-26T10:00:00Z" }], now).state,
      quickPayState([{ status: "rejected", created_at: "2026-09-26T10:00:00Z" }], now).state,
    ]);
    for (const state of produced) {
      expect(ALL_STATES, state).toContain(state);
      expect(quickPayCopy(view(state as QuickPayState)).detail, state).toBeTruthy();
    }
  });

  it("shows what is left when it is on", () => {
    expect(quickPayCopy(view("on", { allowance: 20_000, remaining: 18_500 })).detail).toContain("₦18,500 of ₦20,000");
  });

  it("tells a customer who has not sent the ₦50 what to do — and one who has, to wait", () => {
    expect(quickPayCopy(view("setting_up")).detail).toMatch(/₦50/);
    expect(quickPayCopy(view("setting_up")).action).toBe("cancel_setup");
    const approved = quickPayCopy(view("setting_up", { bankApproved: true }));
    expect(approved.title).toMatch(/bank is switching it on/i);
    expect(approved.action).toBeNull();
  });

  it("every failure says nothing was taken and offers a retry", () => {
    for (const failure of ["bank_declined", "wrong_account", "not_finished"] as const) {
      const copy = quickPayCopy(view("failed", { failure }));
      expect(copy.detail, failure).toMatch(/nothing was taken/i);
      expect(copy.action, failure).toBe("try_again");
    }
  });

  it("the failure kinds are exactly the ones the server sends", () => {
    const server = readFileSync(
      join(__dirname, "..", "supabase", "functions", "mono-mandate", "index.ts"),
      "utf8",
    );
    expect(server).toMatch(/type FailureKind = "bank_declined" \| "wrong_account" \| "not_finished"/);
  });

  it("names the missing details, never anything else", () => {
    expect(missingDetailsMessage([])).toBe("");
    expect(missingDetailsMessage(["BVN"])).toMatch(/your BVN on file/);
    expect(missingDetailsMessage(["email address", "home address", "BVN"])).toMatch(
      /email address, home address and BVN/,
    );
  });
});

describe("the screens use it", () => {
  const ROOT = join(__dirname, "..", "mobile-app", "src");
  const code = (rel: string) => {
    const path = join(ROOT, rel);
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts
      .createPrinter({ removeComments: true })
      .printFile(ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind));
  };

  it("Linked Banks shows quick pay only once the business offers it", () => {
    const src = code("screens/main/SettingsScreen.tsx");
    expect(src).toMatch(/quickPay\.status\.available && quickPay\.forAccount\(acc\.id\)/);
  });

  it("removing a bank switches its quick pay off first", () => {
    const src = code("screens/main/SettingsScreen.tsx");
    const stop = src.indexOf("await stopQuickPay(targetId)");
    const unlink = src.indexOf("await unlinkAccount(targetId)");
    expect(stop).toBeGreaterThan(-1);
    expect(unlink).toBeGreaterThan(stop);
  });

  it("the purchase screen no longer calls every payment 'Mono DirectPay'", () => {
    expect(code("screens/main/QuickServiceScreen.tsx")).not.toMatch(/Mono DirectPay/);
    // The redesign says how the money is taken on the confirm step, under the
    // account it comes from: "Quick pay" or "Approve at your bank".
    expect(code("components/purchase/ConfirmPaySheet.tsx")).toMatch(/paymentMethodLabel\(account\.quickPay\)/);
  });
});
