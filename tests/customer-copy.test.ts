import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { CUSTOMER_STATUS_COPY } from "../supabase/functions/_shared/vtu-state";

/**
 * What customers are told about their payment.
 *
 * The first sandbox purchase was refused by Mono because the business had no
 * DirectPay access, and the customer was told "Your bank declined this
 * payment". No bank had seen it. payment_failed also covers a customer
 * abandoning or cancelling Mono's page, so the copy must not blame the bank.
 */

const ROOT = join(__dirname, "..");

/** Code with comments removed, so explanatory comments may still say "declined". */
function code(path: string): string {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts
    .createPrinter({ removeComments: true })
    .printFile(ts.createSourceFile(path, readFileSync(join(ROOT, path), "utf8"), ts.ScriptTarget.Latest, true, kind));
}

/** The mobile app's STATUS_COPY object literal, read from source. */
function mobileStatusCopy(): Record<string, string> {
  const path = join(ROOT, "mobile-app", "src", "lib", "transactionStatus.ts");
  const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const out: Record<string, string> = {};
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === "STATUS_COPY" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
          out[prop.name.getText()] = prop.initializer.text;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const BLAMES_THE_BANK = /bank (declined|rejected)|declined by your bank|your bank could not/i;

describe("payment_failed never blames the bank", () => {
  it("server status copy", () => {
    expect(CUSTOMER_STATUS_COPY.payment_failed).toMatch(/nothing was charged/i);
    expect(CUSTOMER_STATUS_COPY.payment_failed).not.toMatch(BLAMES_THE_BANK);
  });

  it("the message when Mono refuses to start a payment", () => {
    expect(code("supabase/functions/vtu-service/index.ts")).not.toMatch(BLAMES_THE_BANK);
    expect(code("supabase/functions/_shared/mono.ts")).not.toMatch(BLAMES_THE_BANK);
  });

  it("the push notification", () => {
    expect(code("supabase/functions/_shared/push.ts")).not.toMatch(BLAMES_THE_BANK);
  });

  it("the mobile app's own copy", () => {
    expect(mobileStatusCopy().payment_failed).toMatch(/nothing was charged/i);
    expect(code("mobile-app/src/lib/transactionStatus.ts")).not.toMatch(BLAMES_THE_BANK);
    expect(code("mobile-app/src/screens/main/QuickServiceScreen.tsx")).not.toMatch(BLAMES_THE_BANK);
  });
});

describe("the app says what the server says", () => {
  it("STATUS_COPY in the app mirrors CUSTOMER_STATUS_COPY on the server, word for word", () => {
    // Two hand-kept copies drift. The app's comment says it mirrors the
    // server; this makes that true rather than hoped.
    const mobile = mobileStatusCopy();
    expect(Object.keys(mobile).sort()).toEqual(Object.keys(CUSTOMER_STATUS_COPY).sort());
    expect(mobile).toEqual({ ...CUSTOMER_STATUS_COPY });
  });
});
