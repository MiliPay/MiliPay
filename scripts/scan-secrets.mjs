#!/usr/bin/env node
/**
 * Secret scanner for the MiliPay monorepo.
 *
 * Exists because live VTPass credentials were committed in b31c107d and sat in
 * the repository for 14 commits before anyone noticed.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs --staged     scan what is about to be committed (pre-commit hook)
 *   node scripts/scan-secrets.mjs --history    scan every blob in every branch (audit)
 *   node scripts/scan-secrets.mjs <paths...>   scan specific files
 *
 * Exits non-zero when something looks like a credential.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });

// ─────────────────────────────────────────────────────────────
// What counts as a secret
// ─────────────────────────────────────────────────────────────
const RULES = [
  { name: 'VTPass secret key',       re: /\bSK_[A-Za-z0-9]{30,}\b/ },
  { name: 'Mono secret key',         re: /\b(?:test|live)_sk_[A-Za-z0-9]{10,}\b/ },
  { name: 'Flutterwave secret key',  re: /\bFLWSECK(?:_TEST)?-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Resend API key',          re: /\bre_[A-Za-z0-9_]{20,}\b/ },
  { name: 'Google/Firebase API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'AWS access key id',       re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block',       re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'JWT (check the role claim)', re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    name: 'Hardcoded gateway credential header',
    re: /['"](?:api-key|secret-key|mono-sec-key|x-service-key)['"]\s*:\s*['"][A-Za-z0-9_-]{16,}['"]/i,
  },
  {
    name: 'Operator secret assigned inline',
    re: /\b(?:VTPASS_SECRET_KEY|VTPASS_API_KEY|BIGISUB_API_TOKEN|BIGISUB_TRANSACTION_PIN|MONO_SECRET_KEY|MONO_PAYMENTS_SECRET_KEY|MONO_WEBHOOK_SECRET|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/,
  },
  {
    // The whole class of mistake: a server secret handed to the client bundle.
    name: 'Server secret exposed via a public client prefix',
    re: /\b(?:EXPO_PUBLIC|VITE|NEXT_PUBLIC)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|TRANSACTION_PIN|API_TOKEN)[A-Z0-9_]*\b/,
  },
];

// ─────────────────────────────────────────────────────────────
// Known-safe values. The Supabase anon key is designed to be public: it ships
// in every client bundle and is only as strong as the RLS behind it.
// ─────────────────────────────────────────────────────────────
const ALLOWED_SUBSTRINGS = [
  // Supabase anon key for project hkhnduxbxfcqjgrdnqcz (role: "anon").
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24i',
];

// Paths that are documentation of the shape of a secret, not a secret.
const SKIP_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.firebase\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)scripts\/scan-secrets\.mjs$/,
  /(^|\/)\.env\.example$/,
];

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|md|ya?ml|txt|html|env|sh)$/i;

function isSkipped(p) {
  return SKIP_PATHS.some((re) => re.test(p));
}

function redact(s) {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : '…';
}

/** Allow an explicit opt-out for a reviewed line. */
const INLINE_ALLOW = /secret-scan:\s*allow/i;

function scanText(text, label, findings) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (INLINE_ALLOW.test(line)) return;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (ALLOWED_SUBSTRINGS.some((a) => line.includes(a))) continue;
      findings.push({ rule: rule.name, label, line: i + 1, match: redact(m[0]) });
    }
  });
}

function scanStaged() {
  const findings = [];
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !isSkipped(p) && (TEXT_EXT.test(p) || path.basename(p).startsWith('.env')));

  for (const file of staged) {
    let content;
    try {
      content = git(['show', `:${file}`]); // the staged blob, not the working tree
    } catch {
      continue;
    }
    scanText(content, file, findings);
  }
  return findings;
}

function scanHistory() {
  const findings = [];
  const seen = new Set();
  const entries = git(['rev-list', '--all', '--objects']).split('\n');

  for (const entry of entries) {
    const sp = entry.indexOf(' ');
    if (sp === -1) continue;
    const sha = entry.slice(0, sp);
    const p = entry.slice(sp + 1);
    if (!p || isSkipped(p) || !TEXT_EXT.test(p)) continue;
    if (seen.has(sha)) continue;
    seen.add(sha);
    let content;
    try {
      content = git(['cat-file', '-p', sha]);
    } catch {
      continue;
    }
    scanText(content, `${p} @ ${sha.slice(0, 8)}`, findings);
  }
  return findings;
}

function scanPaths(paths) {
  const findings = [];
  for (const p of paths) {
    if (!fs.existsSync(p) || isSkipped(p)) continue;
    scanText(fs.readFileSync(p, 'utf8'), p, findings);
  }
  return findings;
}

const args = process.argv.slice(2);
const mode = args[0];

let findings;
let scope;
if (mode === '--staged') {
  findings = scanStaged();
  scope = 'staged changes';
} else if (mode === '--history') {
  findings = scanHistory();
  scope = 'full history';
} else if (args.length > 0) {
  findings = scanPaths(args);
  scope = `${args.length} path(s)`;
} else {
  console.error('usage: scan-secrets.mjs [--staged | --history | <paths...>]');
  process.exit(2);
}

if (findings.length === 0) {
  console.log(`secret scan: clean (${scope})`);
  process.exit(0);
}

// Deduplicate identical rule+match+label.
const unique = new Map();
for (const f of findings) {
  unique.set(`${f.rule}|${f.match}|${f.label}`, f);
}

console.error(`\nsecret scan: ${unique.size} possible credential(s) in ${scope}\n`);
for (const f of unique.values()) {
  console.error(`  [${f.rule}]`);
  console.error(`      ${f.label}:${f.line}  ->  ${f.match}`);
}
console.error(`
Secrets belong in Supabase Edge Function secrets or a gitignored .env,
never in tracked source. See .env.example for the environment contract.

If a match is a false positive, append  // secret-scan: allow  to that line
and say in review why it is safe.
`);
process.exit(1);
