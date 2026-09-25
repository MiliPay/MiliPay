import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { paymentAccountView } from "../mobile-app/src/lib/paymentAccounts";

/**
 * The "Payment account" section of a purchase screen.
 *
 * It rendered `accounts.length > 1 ? list : "No bank account linked"`, so a
 * customer with exactly ONE linked bank was told they had none — found on the
 * first sandbox purchase, by a customer with one bank. An empty list during
 * loading, or after a failed load, said the same thing.
 */

describe("paymentAccountView", () => {
  it("shows a single linked bank — the case that used to say 'none'", () => {
    expect(paymentAccountView({ count: 1, isLoading: false, error: null })).toBe("list");
  });

  it("shows several", () => {
    expect(paymentAccountView({ count: 3, isLoading: false, error: null })).toBe("list");
  });

  it("keeps showing the accounts while they refresh", () => {
    // Re-reading on arrival must not blank a list the customer is looking at.
    expect(paymentAccountView({ count: 1, isLoading: true, error: null })).toBe("list");
  });

  it("says loading, not 'none', while the first load is in flight", () => {
    expect(paymentAccountView({ count: 0, isLoading: true, error: null })).toBe("loading");
  });

  it("says the load failed, not 'none', when it did", () => {
    // Telling someone to link a bank they already have is the wrong advice.
    expect(paymentAccountView({ count: 0, isLoading: false, error: "Network request failed" })).toBe("error");
  });

  it("says 'none' only when a finished load found nothing", () => {
    expect(paymentAccountView({ count: 0, isLoading: false, error: null })).toBe("none");
  });
});

describe("the purchase screen uses it", () => {
  const screen = ts
    .createPrinter({ removeComments: true })
    .printFile(
      ts.createSourceFile(
        "QuickServiceScreen.tsx",
        readFileSync(join(__dirname, "..", "mobile-app", "src", "screens", "main", "QuickServiceScreen.tsx"), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
    );

  it("no longer decides by 'more than one account'", () => {
    expect(screen).not.toMatch(/linkedAccounts\.length\s*>\s*1\s*\?/);
    expect(screen).toMatch(/accountView === 'list'/);
  });

  it("reads the accounts itself on arrival, instead of relying on the home screen", () => {
    expect(screen).toMatch(/useEffect\(\(\) => \{\s*if \(user\?\.id\)\s*void fetchAccounts\(user\.id\);/);
  });

  it("refreshes the list after linking, rather than appending to a possibly stale one", () => {
    const store = readFileSync(join(__dirname, "..", "mobile-app", "src", "store", "useStore.ts"), "utf8");
    expect(store).toMatch(/await get\(\)\.fetchAccounts\(userId\)/);
    expect(store).not.toMatch(/linkedAccounts: \[\.\.\.state\.linkedAccounts, newAccount\]/);
  });
});
