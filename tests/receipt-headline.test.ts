import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Receipts must say what actually happened.
 *
 * Both in-app receipts once drew a green tick and "Payment Successful!" for
 * every transaction. On the first sandbox purchase a payment Mono refused to
 * start — nothing charged — opened as a successful receipt.
 *
 * The redesign draws every status in one place, statusHeadline() in
 * statusView.ts (its rules are tested in status-view.test.ts). These checks
 * make sure every receipt the customer can see or share takes its headline
 * from there, and none has gone back to assuming success.
 */

const ROOT = join(__dirname, "..", "mobile-app", "src");
const code = (rel: string) => {
  const path = join(ROOT, rel);
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts
    .createPrinter({ removeComments: true })
    .printFile(ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind));
};

const ASSUMES_SUCCESS = /Payment Successful|Transaction Successful|Status: Successful/i;

describe("every receipt takes its headline from the status", () => {
  it("the purchase screen ends on a receipt carrying the settled status", () => {
    const screen = code("screens/main/QuickServiceScreen.tsx");
    expect(screen).toMatch(/navigation\.replace\('Receipt', \{[\s\S]*?status: snap\.status/);
  });

  it("the receipt screen", () => {
    const receipt = code("screens/main/ReceiptScreen.tsx");
    expect(receipt).toMatch(/statusHeadline\(r\.status\)/);
    expect(receipt).not.toMatch(ASSUMES_SUCCESS);
  });

  it("a transaction's details, opened from Home, Activity or Notifications", () => {
    const sheet = code("components/activity/TxDetailSheet.tsx");
    expect(sheet).toMatch(/statusHeadline\(tx\.status\)/);
    expect(sheet).not.toMatch(ASSUMES_SUCCESS);
    for (const screen of ["screens/main/HomeScreen.tsx", "screens/main/ActivityScreen.tsx", "screens/main/NotificationsScreen.tsx"]) {
      const src = code(screen);
      expect(src, screen).toMatch(/<TxDetailSheet/);
      expect(src, screen).not.toMatch(ASSUMES_SUCCESS);
    }
  });

  it("the shared PDF", () => {
    const pdf = code("lib/receiptSharing.ts");
    expect(pdf).toMatch(/statusHeadline\(receipt\.status\)/);
    expect(pdf).not.toMatch(ASSUMES_SUCCESS);
    // Money that never left, or came back, is not "Amount Paid".
    expect(pdf).not.toMatch(/Amount Paid/);
    expect(pdf).toMatch(/isReturned\(receipt\.status\)/);
  });

  it("the list rows no longer label every failed payment 'Declined'", () => {
    expect(code("lib/statusView.ts")).not.toMatch(/label: 'Declined'/);
    expect(code("components/activity/TxRow.tsx")).toMatch(/rowStatus\(tx\.status\)/);
  });
});
