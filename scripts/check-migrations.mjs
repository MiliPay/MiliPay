#!/usr/bin/env node
/**
 * Validate every Supabase migration before it reaches the database.
 *
 * Two migrations once shipped with a UTF-8 BOM. PostgreSQL rejects it with
 * "syntax error at or near" pointing at an invisible character, so `db push`
 * failed and every later migration was blocked behind them. Nothing caught it.
 *
 * Checks:
 *   1. No UTF-8 BOM.
 *   2. The file parses under the real PostgreSQL grammar.
 *
 * Note: pgsql-parser validates the outer SQL only. PL/pgSQL function bodies
 * inside $$ ... $$ are opaque string literals to it, so a logic error in a
 * function body will still pass here. Apply to a branch before production.
 *
 * Usage: node scripts/check-migrations.mjs [dir]
 */

import fs from 'fs';
import path from 'path';

const dir = process.argv[2] ?? 'supabase/migrations';

if (!fs.existsSync(dir)) {
  console.error(`no such directory: ${dir}`);
  process.exit(2);
}

let parse;
try {
  ({ parse } = await import('pgsql-parser'));
} catch {
  console.error(
    'pgsql-parser is not installed.\n' +
      '  npm install --no-save pgsql-parser@13',
  );
  process.exit(2);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log(`no migrations found in ${dir}`);
  process.exit(0);
}

let failed = 0;

for (const file of files) {
  const full = path.join(dir, file);
  const buf = fs.readFileSync(full);

  // 1. Byte-order mark
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.log(`FAIL ${file}`);
    console.log('       starts with a UTF-8 BOM; PostgreSQL will reject it');
    failed++;
    continue;
  }

  // 2. Grammar
  try {
    await parse(buf.toString('utf8'));
    console.log(`ok   ${file}`);
  } catch (err) {
    console.log(`FAIL ${file}`);
    console.log(`       ${err?.message ?? err}`);
    failed++;
  }
}

console.log(
  failed === 0
    ? `\nAll ${files.length} migration(s) valid.`
    : `\n${failed} of ${files.length} migration(s) invalid.`,
);

// Set exitCode rather than calling process.exit(): the parser is a native
// module, and tearing libuv down underneath it trips an assertion and reports
// 127 instead of our status.
process.exitCode = failed === 0 ? 0 : 1;
