#!/usr/bin/env node
/**
 * Schema drift detection.
 *
 * Why this exists: on 2026-09-21 the live database was found to carry three
 * wide-open RLS policies that appear in no migration, while a policy that *is*
 * in a migration was absent, and a function had a different signature from the
 * one every migration referenced. The repository was not a description of the
 * running system, so no security review of the code could be trusted.
 *
 * This fetches public.security_snapshot() — RLS state, policies, table and
 * column privileges for anon/authenticated, and every function's security
 * attributes — and compares it against the committed snapshot.
 *
 *   node scripts/schema-snapshot.mjs           # compare, exit 1 on drift
 *   node scripts/schema-snapshot.mjs --write   # accept current state
 *
 * Needs SUPABASE_URL and a service-role key. It reads .env when present so it
 * works locally with no extra setup; CI supplies them as secrets.
 *
 * Deliberately no database driver: this goes over PostgREST with fetch, so it
 * runs anywhere Node 20 does, without Docker or a Postgres client.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SNAPSHOT_PATH = path.join("supabase", "security-snapshot.json");

function loadDotEnv() {
  // Only fills gaps: a real environment variable always wins.
  for (const file of [".env", ".env.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

async function fetchSnapshot() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "schema-snapshot: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
        "Set them in .env for local use, or as CI secrets."
    );
    process.exit(2);
  }

  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/security_snapshot`;

  // undici's 10s connect timeout is too tight for this endpoint on a slow or
  // flaky link, and a transient failure here would fail CI for no good reason.
  const ATTEMPTS = 3;
  let response;
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      });
      break;
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) {
        const waitMs = attempt * 2000;
        console.error(
          `schema-snapshot: attempt ${attempt}/${ATTEMPTS} could not reach Supabase; retrying in ${waitMs / 1000}s`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  if (!response) {
    console.error(
      `schema-snapshot: could not reach ${endpoint} after ${ATTEMPTS} attempts.`
    );
    console.error(lastError?.cause?.message ?? lastError?.message ?? lastError);
    process.exit(2);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`schema-snapshot: RPC failed (HTTP ${response.status}).`);
    if (response.status === 404) {
      console.error(
        "The security_snapshot() function is missing. Apply migration\n" +
          "20260921100000_security_snapshot_function.sql first."
      );
    } else if (body) {
      console.error(body.slice(0, 500));
    }
    process.exit(2);
  }

  return response.json();
}

/** Stable key order so a diff only ever reflects a real change. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  }
  return value;
}

const serialise = (snapshot) => JSON.stringify(canonical(snapshot), null, 2) + "\n";

/** Compare two arrays of objects by a stable identity, not by position. */
function diffSection(name, expected = [], actual = [], identity) {
  const index = (rows) => new Map(rows.map((r) => [identity(r), JSON.stringify(canonical(r))]));
  const before = index(expected);
  const after = index(actual);
  const problems = [];

  for (const [id, json] of after) {
    if (!before.has(id)) problems.push(`  + ADDED    ${name}: ${id}`);
    else if (before.get(id) !== json) problems.push(`  ~ CHANGED  ${name}: ${id}`);
  }
  for (const id of before.keys()) {
    if (!after.has(id)) problems.push(`  - REMOVED  ${name}: ${id}`);
  }
  return problems;
}

function diff(expected, actual) {
  return [
    ...diffSection("table", expected.tables, actual.tables, (r) => r.name),
    ...diffSection("policy", expected.policies, actual.policies, (r) => `${r.table}."${r.name}"`),
    ...diffSection(
      "table grant",
      expected.table_grants,
      actual.table_grants,
      (r) => `${r.table} ${r.grantee} ${r.privilege}`
    ),
    ...diffSection(
      "column grant",
      expected.column_grants,
      actual.column_grants,
      (r) => `${r.table} ${r.grantee} ${r.privilege}`
    ),
    ...diffSection("function", expected.functions, actual.functions, (r) => `${r.name}(${r.args})`),
  ];
}

/**
 * Tables whose every row is legitimately visible to any signed-in user, so an
 * unconditional SELECT policy is the correct design rather than an oversight.
 *
 * Keep this list short and justify each entry. An unconditional policy that
 * reaches the public or anon roles is never acceptable and cannot be exempted
 * here, whatever the table.
 */
const GLOBAL_READ_TABLES = new Set([
  // One row of VTU surcharges. A customer has to be able to see the fee they
  // are about to pay; column grants withhold updated_by.
  "vtu_settings",
]);

/**
 * Conditions that are wrong regardless of what the snapshot says, so a drifted
 * snapshot that someone accepted with --write still gets caught.
 */
function auditRisks(snapshot) {
  const risks = [];

  for (const p of snapshot.policies ?? []) {
    const open = (expr) => expr === "true";
    if (!open(p.using) && !open(p.check)) continue;

    const roles = p.roles ?? [];
    const reachesAnon = roles.includes("public") || roles.includes("anon");
    const exempt =
      !reachesAnon && p.command === "SELECT" && GLOBAL_READ_TABLES.has(p.table);

    if (exempt) continue;

    risks.push(
      `policy ${p.table}."${p.name}" (${p.command}) is unconditional — it grants every row to ${roles.join(", ")}`
    );
  }

  for (const f of snapshot.functions ?? []) {
    if (f.security_definer && f.anon_execute) {
      risks.push(`SECURITY DEFINER ${f.name}(${f.args}) is callable without signing in`);
    }
    if (f.security_definer && !f.search_path_pinned) {
      risks.push(`SECURITY DEFINER ${f.name}(${f.args}) has no pinned search_path`);
    }
  }

  for (const t of snapshot.tables ?? []) {
    if (!t.rls_enabled) risks.push(`table ${t.name} has RLS disabled`);
  }

  return risks;
}

async function main() {
  loadDotEnv();
  const actual = await fetchSnapshot();
  const write = process.argv.includes("--write");

  const risks = auditRisks(actual);

  if (write) {
    fs.writeFileSync(SNAPSHOT_PATH, serialise(actual));
    console.log(`schema-snapshot: wrote ${SNAPSHOT_PATH}`);
    if (risks.length) {
      console.log(`\n${risks.length} risk(s) present in the live schema:`);
      for (const r of risks) console.log(`  ! ${r}`);
    }
    return;
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(
      `schema-snapshot: no baseline at ${SNAPSHOT_PATH}.\n` +
        "Run: node scripts/schema-snapshot.mjs --write"
    );
    process.exit(2);
  }

  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  const problems = diff(expected, actual);

  let failed = false;

  if (problems.length) {
    failed = true;
    console.error(`schema-snapshot: the live schema differs from ${SNAPSHOT_PATH}\n`);
    for (const p of problems) console.error(p);
    console.error(
      "\nEvery one of these should have arrived through a migration.\n" +
        "If the change is intended, add the migration and re-run with --write."
    );
  }

  if (risks.length) {
    failed = true;
    console.error(`\nschema-snapshot: ${risks.length} risk(s) in the live schema:\n`);
    for (const r of risks) console.error(`  ! ${r}`);
  }

  if (failed) process.exit(1);
  console.log(
    `schema-snapshot: live schema matches (${actual.policies.length} policies, ` +
      `${actual.functions.length} functions, no open policies)`
  );
}

main().catch((err) => {
  console.error("schema-snapshot: unexpected failure\n", err);
  process.exit(2);
});
