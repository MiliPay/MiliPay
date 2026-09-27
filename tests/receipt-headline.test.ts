import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { receiptHeadline } from "../mobile-app/src/lib/receiptHeadline";
import { CUSTOMER_STATUS_COPY } from "../supabase/functions/_shared/vtu-state";

/**
 * Receipts must say what actually happened.
 *
 * Both in-app receipts drew a green tick and "Payment Successful!" for every
 * transaction. On the first sandbox purchase a payment Mono refused to start
 * — nothing charged — opened as a successful receipt.
 */

const EVERY_STATUS = Object.keys(CUSTOMER_STATUS_COPY);

describe("receiptHeadline", () => {
  it("covers every transaction status the server has", () => {
    expect(EVERY_STATUS.length).toBeGreaterThanOrEqual(11);
    for (const status of EVERY_STATUS) {
      expect(receiptHeadline(status).title, status).not.toBe("Status unavailable");
    }
  });

  it("calls ONLY a delivered transaction a success", () => {
    for (const status of EVERY_STATUS) {
      const h = receiptHeadline(status);
      if (status === "delivered") {
        expect(h.tone).toBe("ok");
        expect(h.title).toMatch(/successful/i);
      } else {
        expect(h.tone, status).not.toBe("ok");
        expect(h.title, status).not.toMatch(/successful/i);
      }
    }
  });

  it("a payment that never went through: not a success, and nothing charged", () => {
    const h = receiptHeadline("payment_failed");
    expect(h.tone).toBe("bad");
    expect(h.charged).toBe(false);
    expect(h.detail).toMatch(/nothing was charged/i);
    expect(h.title).not.toMatch(/bank (declined|rejected)/i);
  });

  it("shows money as gone only when it actually left the customer", () => {
    expect(receiptHeadline("delivered").charged).toBe(true);
    expect(receiptHeadline("fulfilment_pending").charged).toBe(true);
    expect(receiptHeadline("refund_pending").charged).toBe(true);
    // Never taken, or given back.
    expect(receiptHeadline("initiated").charged).toBe(false);
    expect(receiptHeadline("payment_failed").charged).toBe(false);
    expect(receiptHeadline("refunded").charged).toBe(false);
  });

  it("reads legacy success rows as success", () => {
    for (const s of ["success", "successful", " Delivered "]) {
      expect(receiptHeadline(s).tone, s).toBe("ok");
    }
  });

  it("never guesses 'success' for a status it does not know", () => {
    for (const s of ["", null, undefined, "weird"]) {
      const h = receiptHeadline(s as string);
      expect(h.tone, String(s)).not.toBe("ok");
      expect(h.charged, String(s)).toBe(false);
    }
  });
});

describe("the receipts use it", () => {
  const ROOT = join(__dirname, "..", "mobile-app", "src");
  const code = (rel: string) => {
    const path = join(ROOT, rel);
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts
      .createPrinter({ removeComments: true })
      .printFile(ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind));
  };

  it("the home-screen and history receipts no longer hardcode success", () => {
    for (const screen of ["screens/main/HomeScreen.tsx", "screens/main/TransactionsScreen.tsx"]) {
      const src = code(screen);
      expect(src, screen).not.toMatch(/Payment Successful!|Transaction Successful/);
      expect(src, screen).toMatch(/<ReceiptHeadline status=\{selectedTx\?\.status\}/);
    }
  });

  it("the purchase screen's receipt says what actually happened", () => {
    // The redesign ends every purchase on the receipt screen, whatever the
    // outcome — so the receipt must take the settled status and draw its
    // headline from it, never assume success.
    const screen = code("screens/main/QuickServiceScreen.tsx");
    expect(screen).toMatch(/navigation\.replace\('Receipt', \{[\s\S]*?status: snap\.status/);
    const receipt = code("screens/main/ReceiptScreen.tsx");
    expect(receipt).toMatch(/statusHeadline\(r\.status\)/);
    expect(receipt).not.toMatch(/Payment Successful|Transaction Successful/);
  });

  it("the shared PDF receipt takes its status from the same place", () => {
    expect(code("lib/receiptSharing.ts")).toMatch(/receiptHeadline\(status\)/);
  });

  it("the history list no longer labels every failed payment 'Declined'", () => {
    expect(code("lib/transactionStatus.ts")).not.toMatch(/label: 'Declined'/);
  });
});
