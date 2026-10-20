#!/usr/bin/env node
/**
 * Copy MiliPay's data from one Supabase database into another.
 *
 * First used on 2026-10-20 to move the original Frankfurt project into
 * staging (which serves the live portals until the Nigeria production
 * database exists); the same copy will move staging into production.
 *
 * What it copies: every table in `public` that both databases have, and the
 * sign-in accounts (auth.users, auth.identities, auth.mfa_factors), so
 * staff, merchants and customers keep their passwords and authenticators.
 * What it leaves alone: the target's Vault secrets, migration history,
 * Edge Function secrets and storage.
 *
 * Safety:
 *   - Without --commit it is a rehearsal: everything is copied inside one
 *     transaction and then rolled back. Nothing changes.
 *   - With --commit the same transaction is kept. Any error undoes all of it.
 *   - The source is only read (a read-only, repeatable-read transaction).
 *   - Triggers and foreign-key checks are off in the target while copying
 *     (session_replication_role = replica), so rows land exactly as they
 *     were: no notifications fire, no audit rows are added, the audit hash
 *     chain is copied byte for byte.
 *   - Values travel in PostgreSQL's own COPY text format, so nothing is
 *     rounded (timestamps keep their microseconds).
 *
 * Run it through scripts/copy-database.ps1, which asks for the two
 * connection strings without showing them. They are never written down.
 *
 *   SOURCE_DB_URL=... TARGET_DB_URL=... node scripts/copy-database.mjs [--commit]
 */
import pg from "pg";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";

const COMMIT = process.argv.includes("--commit");
const AUTH_TABLES = ["auth.users", "auth.identities", "auth.mfa_factors"];

function client(url, name) {
  if (!url) {
    console.error(`${name} is not set. Run this through scripts/copy-database.ps1.`);
    process.exit(2);
  }
  return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

const q = (ident) => ident.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");

async function tablesIn(db) {
  const { rows } = await db.query(
    `select table_schema || '.' || table_name as t from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  return rows.map((r) => r.t);
}

/** Columns that can be copied: not generated. */
async function columnsOf(db, table) {
  const [schema, name] = table.split(".");
  const { rows } = await db.query(
    `select column_name from information_schema.columns
      where table_schema = $1 and table_name = $2 and coalesce(is_generated, 'NEVER') = 'NEVER'
      order by ordinal_position`,
    [schema, name],
  );
  return rows.map((r) => r.column_name);
}

async function count(db, table) {
  const { rows } = await db.query(`select count(*)::int as n from ${q(table)}`);
  return rows[0].n;
}

async function main() {
  const source = client(process.env.SOURCE_DB_URL, "SOURCE_DB_URL");
  const target = client(process.env.TARGET_DB_URL, "TARGET_DB_URL");
  await source.connect();
  await target.connect();

  const [srcHost, tgtHost] = [process.env.SOURCE_DB_URL, process.env.TARGET_DB_URL].map((u) => new URL(u).username);
  console.log(`From: ${srcHost}\nTo:   ${tgtHost}\nMode: ${COMMIT ? "COMMIT (keeps the copy)" : "REHEARSAL (everything is undone at the end)"}\n`);
  if (srcHost === tgtHost) throw new Error("Source and target are the same database.");

  await source.query("begin isolation level repeatable read read only");
  await target.query("begin");
  await target.query("set local session_replication_role = replica");

  const srcTables = new Set(await tablesIn(source));
  const tgtTables = await tablesIn(target);
  const both = tgtTables.filter((t) => srcTables.has(t));
  const onlyTarget = tgtTables.filter((t) => !srcTables.has(t));
  const onlySource = [...srcTables].filter((t) => !tgtTables.includes(t));

  // Start the target clean: its rows are test data or migration defaults.
  if (tgtTables.length) await target.query(`truncate ${tgtTables.map(q).join(", ")} cascade`);
  await target.query("delete from auth.mfa_factors");
  await target.query("delete from auth.identities");
  await target.query("delete from auth.sessions");
  await target.query("delete from auth.users");

  const report = [];
  for (const table of [...AUTH_TABLES, ...both]) {
    const srcCols = await columnsOf(source, table);
    const tgtCols = await columnsOf(target, table);
    const cols = tgtCols.filter((c) => srcCols.includes(c));
    const dropped = srcCols.filter((c) => !tgtCols.includes(c));
    const list = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
    await pipeline(
      source.query(copyTo(`copy ${q(table)} (${list}) to stdout`)),
      target.query(copyFrom(`copy ${q(table)} (${list}) from stdin`)),
    );
    const [s, t] = [await count(source, table), await count(target, table)];
    report.push({ table, source: s, target: t, ok: s === t ? "yes" : "NO", "source-only columns": dropped.join(" ") });
  }

  // Sequences follow the copied ids.
  const { rows: seqs } = await target.query(
    `select s.relname as seq, t.relname as tbl, a.attname as col
       from pg_class s
       join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
       join pg_class t on t.oid = d.refobjid
       join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
       join pg_namespace n on n.oid = s.relnamespace
      where s.relkind = 'S' and n.nspname = 'public'`,
  );
  for (const r of seqs) {
    await target.query(
      `select setval('public.${r.seq}', coalesce((select max("${r.col}") from public."${r.tbl}"), 0) + 1, false)`,
    );
  }

  console.table(report);
  if (onlySource.length) console.log(`\nTables only in the source (not copied): ${onlySource.join(", ")}`);
  if (onlyTarget.length) console.log(`Tables only in the target (left empty): ${onlyTarget.join(", ")}`);

  const bad = report.filter((r) => r.ok !== "yes");
  if (bad.length) throw new Error(`Row counts differ for: ${bad.map((r) => r.table).join(", ")}`);

  if (COMMIT) {
    await target.query("commit");
    console.log("\nCOMMITTED: the copy is kept.");
  } else {
    await target.query("rollback");
    console.log("\nREHEARSAL OK: everything above was undone. Run again with -Commit to keep it.");
  }
  await source.query("rollback");
  await source.end();
  await target.end();
}

main().catch(async (err) => {
  console.error(`\nSTOPPED, nothing was kept: ${err.message}`);
  process.exit(1);
});
