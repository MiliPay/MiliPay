import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * BigiSub must not be reachable from any live money path.
 *
 * Source-level assertions, deliberately. The Edge Functions run on Deno with
 * https:// imports and Deno.env, so vitest cannot execute them — but what is
 * protected here is not a behaviour, it is a WIRING decision that one stray
 * import would quietly undo.
 *
 * The accident these exist to catch has already happened once: the purchase
 * path in vtu-service moved to VTPass while vtu-reconcile — the scheduled
 * sweep that resolves every timeout — was left calling BigiSub, and skipping
 * exactly the transactions VTPass could recover. Nothing failed loudly.
 *
 * BigiSub itself stays in the repository. Parked is fine; reachable is not.
 */

const ROOT = join(__dirname, "..");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const PARKED = join(FUNCTIONS, "_shared", "bigisub.ts");

function rel(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

function parse(path: string): ts.SourceFile {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

/**
 * The file's CODE, with every comment removed by the TypeScript parser.
 *
 * Comments naming BigiSub are wanted — they are the record of why it was
 * parked — so these assertions must see code and only code.
 *
 * This used to strip comments with two regexes. That is not safe: a string
 * such as "**\/*.ts" or a regex literal containing // is indistinguishable
 * from a comment to a regex, and stripping it can delete real code — which
 * turns a failing assertion into a silent pass. Re-printing the parsed AST
 * with removeComments cannot make that mistake, and (unlike a full emit) it
 * keeps unused imports, which is exactly the case a stray `import * as
 * bigisub` would be.
 *
 * String literals are kept: user-facing text such as "Check BigiSub's
 * dashboard" IS code, and staff reading it act on it.
 */
function code(path: string): string {
  return ts.createPrinter({ removeComments: true }).printFile(parse(path));
}

function walk(dir: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

/**
 * Every Edge Function and every shared module, minus the parked adapter.
 *
 * Enumerated rather than listed by hand: a hand-written list goes stale the
 * day a new function is added, and that new function is exactly where a
 * forgotten import would land.
 */
const ACTIVE_EDGE_CODE = walk(FUNCTIONS, (f) => f.endsWith(".ts") && f !== PARKED);

const MOBILE_CODE = walk(join(ROOT, "mobile-app", "src"), (f) => /\.(ts|tsx)$/.test(f));

const PORTAL_CODE = [
  join(ROOT, "packages", "shared", "src"),
  join(ROOT, "AdminPanel", "src"),
  join(ROOT, "agent-portal", "src"),
  join(ROOT, "service-portal", "src"),
  join(ROOT, "merchant-portal", "src"),
].flatMap((dir) => walk(dir, (f) => /\.(ts|tsx)$/.test(f)));

/** Lines of code (comments already gone) that match, for a useful failure. */
function offending(files: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    code(file)
      .split("\n")
      .forEach((line) => {
        if (pattern.test(line)) hits.push(`${rel(file)}: ${line.trim()}`);
      });
  }
  return hits;
}

describe("the scan itself is real", () => {
  // A scan over zero files passes every assertion. These guard against the
  // enumeration silently finding nothing — the classic way a check like this
  // stops checking.
  it("covers the Edge Functions that move money", () => {
    const names = ACTIVE_EDGE_CODE.map(rel);
    for (const required of [
      "supabase/functions/vtu-service/index.ts",
      "supabase/functions/vtu-reconcile/index.ts",
      "supabase/functions/mono-webhook/index.ts",
      "supabase/functions/_shared/vtpass.ts",
      "supabase/functions/_shared/environment.ts",
      "supabase/functions/_shared/transactions.ts",
    ]) {
      expect(names, required).toContain(required);
    }
    expect(names).not.toContain("supabase/functions/_shared/bigisub.ts");
  });

  it("covers the mobile client and the portals", () => {
    expect(MOBILE_CODE.map(rel)).toContain("mobile-app/src/lib/vtuService.ts");
    expect(PORTAL_CODE.map(rel)).toContain(
      "packages/shared/src/pages/operations/OperationsPage.tsx",
    );
  });

  it("strips comments without eating code", () => {
    const printed = code(join(FUNCTIONS, "vtu-reconcile", "index.ts"));
    // The file's long comments explaining BigiSub are gone...
    expect(printed).not.toMatch(/NOTE THE MISSING FILTER/);
    // ...and its real code is intact.
    expect(printed).toMatch(/vtpass\.requery\(/);
  });
});

describe("BigiSub is parked, not reachable", () => {
  it("is still in the repository — parked is not deleted", () => {
    expect(existsSync(PARKED)).toBe(true);
  });

  it("is imported by no Edge Function or shared module", () => {
    expect(offending(ACTIVE_EDGE_CODE, /from\s+["'][^"']*bigisub(\.ts)?["']/)).toEqual([]);
  });

  it("appears nowhere in live Edge Function CODE — no call, no string, no env var", () => {
    // The broadest form of the rule. Catches an import, a namespace call, a
    // provider label such as fulfilment_provider: "bigisub", and a fallback
    // read of BIGISUB_* — the last two being mistakes that were actually made
    // and fixed during the move to VTPass.
    expect(offending(ACTIVE_EDGE_CODE, /bigisub/i)).toEqual([]);
  });

  it("has exactly one gateway status mapper, and it is VTPass's", () => {
    // statusForProviderStatus read one status word — BigiSub's vocabulary.
    // Handed a VTPass response it answers "pending" for everything, so nothing
    // would ever resolve. It had no caller and was deleted; it must not come
    // back, as a definition or as a call.
    expect(offending(ACTIVE_EDGE_CODE, /\bstatusForProviderStatus\b/)).toEqual([]);

    const mappers = code(join(FUNCTIONS, "_shared", "vtu-state.ts")).match(
      /export function statusFor\w+/g,
    );
    expect(mappers?.sort()).toEqual([
      "export function statusForIndeterminateFulfilment",
      "export function statusForMonoEvent",
      "export function statusForVtpassResponse",
    ]);
  });

  it("carries none of BigiSub's plan-shelf vocabulary on the purchase path", () => {
    const service = code(join(FUNCTIONS, "vtu-service", "index.ts"));
    expect(service).not.toMatch(/get_sme_plans/);
    expect(service).not.toMatch(/\bdataCategory\b/);
    expect(service).not.toMatch(/\bplanType\b/);
  });

  it("refuses an action it does not know instead of treating it as a purchase", () => {
    // A retired action name used to fall through to the purchase path.
    const service = code(join(FUNCTIONS, "vtu-service", "index.ts"));
    const guardAt = service.search(/if\s*\(action\s*!==\s*"purchase"\)\s*\{\s*throw/);
    const purchaseAt = service.search(/readFulfilmentEnvironment\(Deno\.env\)/);
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(purchaseAt);
  });

  it("is not referenced by the mobile client", () => {
    expect(offending(MOBILE_CODE, /bigisub/i)).toEqual([]);
    // BigiSub's plan-shelf action. The server still answers it for older
    // installed apps; this app must not call it.
    expect(offending(MOBILE_CODE, /get_sme_plans/)).toEqual([]);
  });

  it("is not referenced by the portals — including text shown to staff", () => {
    // The operations board once told staff to "Check BigiSub's dashboard".
    // String literals count: staff act on what the screen tells them.
    expect(offending(PORTAL_CODE, /bigisub/i)).toEqual([]);
  });

  it("does not flag a missing operator id as a problem for staff", () => {
    // Under BigiSub a missing operator id meant "requery cannot ask; resolve
    // by hand", and the board showed it in red. Under VTPass every pending
    // purchase is requeried by request_id, so the same badge would push staff
    // to settle by hand what the sweep is about to settle for them.
    expect(offending(PORTAL_CODE, /no operator id/i)).toEqual([]);
  });
});

describe("reconciliation and recovery run on VTPass", () => {
  const reconcile = code(join(FUNCTIONS, "vtu-reconcile", "index.ts"));

  it("imports the VTPass adapter", () => {
    expect(reconcile).toMatch(/import \* as vtpass from "\.\.\/_shared\/vtpass\.ts"/);
  });

  it("requeries through VTPass", () => {
    expect(reconcile).toMatch(/vtpass\.requery\(/);
  });

  it("reads the wallet through VTPass, with VTPass's own floor", () => {
    expect(reconcile).toMatch(/vtpass\.walletBalance\(/);
    expect(reconcile).toMatch(/VTPASS_WALLET_FLOOR/);
  });

  it("maps outcomes with the reader that needs BOTH code and status", () => {
    expect(reconcile).toMatch(/statusForVtpassResponse\(\s*result\.providerCode\s*,\s*result\.providerStatus\s*\)/);
  });

  it("does NOT skip transactions that have no operator transaction id", () => {
    // The most important line in this file is the one that is absent. The
    // BigiSub-era sweep filtered those rows out, so a purchase whose call
    // timed out was never asked about again. Those are the transactions that
    // most need recovering, and VTPass can answer for them.
    expect(reconcile).not.toMatch(/\.not\(\s*["']operator_transaction_id["']/);
  });

  it("rebuilds request_id from the stored timestamp, falling back to created_at", () => {
    expect(reconcile).toMatch(/row\.initiated_at\s*\?\?\s*row\.created_at/);
  });
});

describe("the schedule actually reaches the VTPass sweep", () => {
  // pg_cron is provider-neutral: it POSTs a task name to vtu-reconcile. So
  // the risk is not BigiSub in SQL — it is a task name the function does not
  // handle, or JWT verification quietly switched on, either of which stops
  // every sweep while every cron run still reports "succeeded".
  const schedule = readFileSync(
    join(ROOT, "supabase", "migrations", "20260921153022_reconciliation_schedule.sql"),
    "utf8",
  );
  const reconcile = code(join(FUNCTIONS, "vtu-reconcile", "index.ts"));

  it("schedules only tasks vtu-reconcile handles", () => {
    const tasks = [...schedule.matchAll(/run_reconcile_task\('(\w+)'\)/g)].map((m) => m[1]);
    expect(tasks.sort()).toEqual(["refunds", "requery", "stuck", "wallet"]);
    for (const task of tasks) {
      expect(reconcile, task).toMatch(new RegExp(`task === "${task}"`));
    }
  });

  it("authenticates with the header the function checks", () => {
    expect(schedule).toMatch(/'x-reconcile-secret', v_secret/);
    expect(schedule).toMatch(/v_url \|\| '\/vtu-reconcile'/);
    expect(reconcile).toMatch(/req\.headers\.get\("x-reconcile-secret"\)/);
  });

  it("pins JWT verification off for the two callers that hold no session", () => {
    // A plain `supabase functions deploy` defaults it ON: Mono and pg_cron
    // would then get a 401 on every call.
    const config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
    for (const fn of ["mono-webhook", "vtu-reconcile"]) {
      expect(config, fn).toMatch(new RegExp(`\\[functions\\.${fn}\\]\\s*\\r?\\nverify_jwt = false`));
    }
  });
});

describe("fulfilment runs on VTPass, only after payment", () => {
  const service = code(join(FUNCTIONS, "vtu-service", "index.ts"));

  it("dispenses value through exactly one gateway call", () => {
    // One call site. Several would mean a per-service switch, which is how a
    // new service type silently takes a wrong branch.
    expect(service.match(/vtpass\.pay\(/g)?.length).toBe(1);
  });

  it("checks the VTPass wallet before the customer's bank is touched", () => {
    const walletAt = service.search(/vtpass\.walletBalance\(/);
    const debitAt = service.search(/initiateDebit\(\s*\{/);
    expect(walletAt).toBeGreaterThan(-1);
    expect(debitAt).toBeGreaterThan(-1);
    expect(walletAt).toBeLessThan(debitAt);
  });

  it("opens the transaction row before initiating the debit", () => {
    // Written at `initiated` BEFORE any money moves, so a crash between the
    // two can never lose a transaction silently.
    const insertAt = service.search(/\.from\("transactions"\)\s*\.insert\(\s*\{/);
    const debitAt = service.search(/initiateDebit\(\s*\{/);
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(debitAt);
  });

  it("refuses to fulfil from any state other than paid", () => {
    expect(service).toMatch(/if\s*\(tx\.status\s*!==\s*"paid"\)\s*return\s+tx\.status;/);
  });

  it("never builds a request_id without a stored timestamp", () => {
    expect(service).toMatch(/tx\.initiated_at\s*\?\?\s*tx\.created_at/);
  });

  it("sends the customer's phone for power and cable, not the meter number", () => {
    // VTPass texts a prepaid token to `phone`. This used to be the meter or
    // smartcard number run through the phone normaliser.
    expect(service).toMatch(/isTelecom\s*\?\s*vtpass\.normalizeNigerianPhone\(tx\.beneficiary/);
    expect(service).toMatch(/vtpass\.normalizeNigerianPhone\(await customerPhone\(admin, tx\.customer_id\)\)/);
  });

  it("keeps simulated mode off the real purchase path", () => {
    expect(service).toMatch(/if\s*\(mode\s*!==\s*"live"\)/);
  });

  it("judges the environment by VTPass's URL only", () => {
    const env = code(join(FUNCTIONS, "_shared", "environment.ts"));
    expect(env).toMatch(/env\.get\("VTPASS_BASE_URL"\)/);
  });
});

describe("each Mono app's key goes where it belongs", () => {
  // Mono fixes an app's product at creation: bank linking is a Connect app,
  // DirectPay a Payments app. Crossing them over fails — Mono refuses the
  // Connect key on the payments API, and the Connect widget's code cannot be
  // exchanged with the Payments key.
  it("payments read the payments key, never MONO_SECRET_KEY directly", () => {
    const mono = code(join(FUNCTIONS, "_shared", "mono.ts"));
    expect(mono).toMatch(/monoPaymentsSecret\(Deno\.env\)/);
    expect(mono).not.toMatch(/Deno\.env\.get\("MONO_SECRET_KEY"\)/);
  });

  it("bank linking keeps the Connect app's key", () => {
    const link = code(join(FUNCTIONS, "link-mono-account", "index.ts"));
    expect(link).toMatch(/Deno\.env\.get\(['"]MONO_SECRET_KEY['"]\)/);
    expect(link).not.toMatch(/MONO_PAYMENTS_SECRET_KEY/);
  });

  it("the environment check judges the key that moves money", () => {
    const env = code(join(FUNCTIONS, "_shared", "environment.ts"));
    expect(env).toMatch(/monoSecretKey:\s*mono\.key/);
  });
});

describe("the payment mode stays configurable", () => {
  it("reads MONO_PAYMENT_MODE rather than hardcoding directpay", () => {
    const mono = code(join(FUNCTIONS, "_shared", "mono.ts"));
    expect(mono).toContain('Deno.env.get("MONO_PAYMENT_MODE")');
    expect(mono).toMatch(/"directpay"/);
    expect(mono).toMatch(/"mandate"/);
    expect(code(join(FUNCTIONS, "vtu-service", "index.ts"))).toMatch(/monoPaymentMode\(\)/);
  });
});

describe("sandbox test values cannot reach a production bundle", () => {
  const ENV_FILE = join(ROOT, "mobile-app", "src", "lib", "environment.ts");
  const TEST_VALUES = [
    "08011111111",
    "201000000000",
    "300000000000",
    "400000000000",
    "1111111111111",
    "1010101010101",
    "1212121212",
  ];

  /**
   * True when `fn`'s FIRST statement is exactly the fold-able guard:
   *   if (process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT !== 'sandbox') return ...
   * Metro inlines the env var as a literal, the minifier folds the comparison,
   * and everything after the early return is dropped from a production bundle.
   */
  function startsWithFoldableGuard(fn: ts.FunctionLikeDeclaration): boolean {
    const body = fn.body;
    if (!body || !ts.isBlock(body)) return false;
    const first = body.statements[0];
    if (!first || !ts.isIfStatement(first)) return false;
    const cond = first.expression;
    if (!ts.isBinaryExpression(cond)) return false;
    if (cond.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false;
    if (cond.left.getText() !== "process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT") return false;
    if (!ts.isStringLiteral(cond.right) || cond.right.text !== "sandbox") return false;
    return ts.isReturnStatement(first.thenStatement) ||
      (ts.isBlock(first.thenStatement) && ts.isReturnStatement(first.thenStatement.statements[0]));
  }

  it("keeps every test literal inside a function that opens with the guard", () => {
    // Checked on the AST, not by text position: "a guard appears somewhere
    // earlier in the file" would pass a literal sitting in an unguarded
    // function below a guarded one. The shared-constant version of this file
    // shipped every test number in production; that is the failure this
    // encodes.
    const sf = parse(ENV_FILE);
    const found = new Set<string>();

    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && TEST_VALUES.includes(node.text)) {
        found.add(node.text);
        let owner: ts.Node | undefined = node.parent;
        while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
        expect(owner, `${node.text} is at module scope`).toBeDefined();
        expect(
          startsWithFoldableGuard(owner as ts.FunctionLikeDeclaration),
          `${node.text} is inside a function without the fold-able guard`,
        ).toBe(true);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // And the scan did find them — zero matches would pass vacuously.
    expect([...found].sort()).toEqual([...TEST_VALUES].sort());
  });

  it("puts no test value anywhere else in the mobile client", () => {
    const elsewhere = MOBILE_CODE.filter((f) => f !== ENV_FILE);
    for (const value of TEST_VALUES) {
      expect(offending(elsewhere, new RegExp(value)), value).toEqual([]);
    }
  });

  it("defaults to production when the variable is unset", () => {
    const env = code(ENV_FILE);
    expect(env).toMatch(/===\s*['"]sandbox['"]/);
    expect(env).not.toMatch(/!==\s*['"]production['"]/);
  });

  it("gives each environment its own Metro cache", () => {
    // The guard above is folded at TRANSFORM time, and Metro's cache key does
    // not include EXPO_PUBLIC_* values. So a production export straight after
    // a sandbox one reused the sandbox-compiled environment.ts and shipped
    // every test number — seen in the built .hbc. Evaluated for real, not
    // pattern-matched: the two environments must produce different keys.
    const mobile = join(ROOT, "mobile-app");
    const keyFor = (value: string | undefined) =>
      execFileSync(process.execPath, ["-e", "process.stdout.write(String(require('./metro.config.js').cacheVersion))"], {
        cwd: mobile,
        env: { ...process.env, EXPO_PUBLIC_MILIPAY_ENVIRONMENT: value ?? "" },
      }).toString();

    const sandbox = keyFor("sandbox");
    const production = keyFor("production");
    expect(sandbox).not.toBe(production);
    // Unset is production, exactly as environment.ts treats it.
    expect(keyFor(undefined)).toBe(production);
  }, 60_000); // three Node processes, each loading expo/metro-config

  it("pins the environment per EAS build profile", () => {
    // EAS does not upload .env, but a LOCAL production build would read it.
    const eas = JSON.parse(readFileSync(join(ROOT, "mobile-app", "eas.json"), "utf8"));
    expect(eas.build.production.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT).toBe("production");
    expect(eas.build.development.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT).toBe("sandbox");
    expect(eas.build.preview.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT).toBe("sandbox");
  });
});

describe("provider credentials stay server-side", () => {
  it("names no server-only secret anywhere in the mobile client's code", () => {
    // Anything EXPO_PUBLIC_ is compiled into the bundle and readable by anyone
    // who unzips the APK.
    const forbidden =
      /VTPASS_API_KEY|VTPASS_SECRET_KEY|VTPASS_PUBLIC_KEY|MONO_SECRET_KEY|MONO_PAYMENTS_SECRET_KEY|MONO_WEBHOOK_SECRET|BIGISUB_API_TOKEN|BIGISUB_TRANSACTION_PIN|SERVICE_ROLE|TERMII_API_KEY|RESEND_API_KEY/;
    expect(offending(MOBILE_CODE, forbidden)).toEqual([]);
  });

  it("exposes no EXPO_PUBLIC_ variable whose name says it is secret", () => {
    const hits = offending(MOBILE_CODE, /EXPO_PUBLIC_\w*(SECRET|TOKEN|PIN|PRIVATE|SERVICE_ROLE|PASSWORD)/);
    expect(hits).toEqual([]);
  });

  it("reads the VTPass credentials in the adapter and nowhere else", () => {
    const readsSecret = /Deno\.env\.get\("VTPASS_(SECRET_KEY|API_KEY|PUBLIC_KEY)"\)/;
    const readers = ACTIVE_EDGE_CODE.filter((f) => readsSecret.test(code(f))).map(rel);
    expect(readers).toEqual(["supabase/functions/_shared/vtpass.ts"]);
  });
});
