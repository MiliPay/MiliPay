# MiliPay: where the project stands

Read this first when picking the project up on a new machine or in a new
session. Last updated 2026-10-14.

No secrets live in this file or anywhere in the repo. Keys are in each
environment's own settings (Supabase secrets, local `.env` files that git
ignores).

## What's live

| What | Where |
|---|---|
| Marketing website (redesign) | https://milipay-website.web.app |
| Support portal | https://milipay-serviceportal.web.app |
| Admin portal (incl. Website › Leads, Waitlist, Agent locations) | https://milipay-adminportal.web.app |
| Agent portal | https://milipay-agentportal.web.app |
| Supabase (dev today, see the plan below) | project `MiliPay`, ref `hkhnduxbxfcqjgrdnqcz`, eu-central-1, on the founder's personal account |
| Firebase hosting | project `aniyu-b841b` (shared with another product, AniYu) |
| GitHub | https://github.com/Alashabeeb/BioPay, branch `main` |

All migrations in `supabase/migrations` are applied to that Supabase
project, and every function in `supabase/functions` is deployed.

## Recently finished

- Portal redesign steps 1–7, the last being the support desk (`ad5cb87e`).
- Website redesign from `website/design_handoff_website`, with the `website`
  Edge Function behind the waitlist, merchant and agent applications and
  Find an agent (`8b8454ab`).
- Database fix: server functions had no rights on several tables, so audit
  rows, push tokens, identity checks, settings reads and more failed
  quietly. Fixed, plus Supabase security advisor findings (`830a7beb`).
- Admin Website pages for leads, waitlist and agent locations
  (`0f1de901`, `6b682e6b`).

## The plan we agreed: separate development and production

Today one Supabase project serves everything, including test work. That has
to end before real customers arrive. Decided on 2026-10-14:

- **Stay on Supabase**, as three projects. A self-built stack (own servers,
  load balancers, several databases) is not needed now and would mean
  rebuilding sign-in, database rules, functions and realtime chat. The
  database is plain PostgreSQL, so moving later stays possible.
- **Development:** the current personal project. Test data, sandbox keys.
- **Staging:** a new project in a MiliPay company organisation. Sandbox
  keys. Free tier is fine.
- **Production:** a new project in the same organisation, paid plan (Pro or
  higher), live keys only, daily backups with point-in-time restore,
  connection pooling, region nearest Nigeria (it can't be changed later).
- **Firebase:** a separate MiliPay Firebase project for production hosting.
- **Changes flow one way:** dev → staging → production, through GitHub
  Actions, never applied to production by hand.
- **Growth later, as traffic needs it:** Redis cache (rate limits, hot
  reads), Supabase read replicas, a queue for bill-payment fulfilment, and
  only if Supabase becomes the limit, PostgreSQL on AWS with load balancers.

### Waiting on the founder

1. Create a Supabase **organisation named MiliPay** with a company email,
   at least two owners, two-factor sign-in for everyone, and billing on a
   company card.
2. Create projects **milipay-production** (paid) and **milipay-staging**.
3. Give Claude's Supabase connector access to that organisation (invite
   the personal account, or reconnect the connector with the company one).
4. Enter the live Mono, VTPass, Termii and Smile ID keys yourself in the
   production project's secrets. Never in chat, never in a `.env` file.
5. Create a **MiliPay Firebase project** under the company Google account.

### Then Claude does

1. Apply all migrations to staging, check them, then to production.
2. Deploy every Edge Function to both.
3. Point each app and portal at the right environment per build.
4. Add GitHub Actions: staging on merge, production on approval.
5. Write the architecture document for the team or investors.

## Other open items

- **Agent locations are empty**, so the website's Find an agent says "no
  agents listed". Add them in Admin › Website › Agent locations.
- **Leaked-password protection** is off in Supabase Auth. Turn it on in the
  dashboard (Authentication › password security). Only the owner should
  change it.
- The website photos are placeholder AI images. Replace with real photos
  of MiliPay hardware before launch.
- `website` lint is broken: its config needs `typescript-eslint`, which
  isn't installed.

## Gotchas on a new machine

- **Git says "dubious ownership"** when the repo folder came from another
  PC. Either run `git config --global --add safe.directory <repo path>`, or
  pass `-c safe.directory=<repo path>` per command.
- **PowerShell blocks `npx`** ("running scripts is disabled"). Use
  `npx.cmd` instead; no need to change the execution policy.
- **Firebase CLI** isn't installed globally. Use
  `npx.cmd -y firebase-tools@13.29.1 login`, then deploy with
  `--only hosting:<website|admin|agent|service>`. Build each app first.
- **GitHub push** needs the `Alashabeeb` account signed in (`gh auth status`).
- **Supabase CLI** isn't installed; migrations and functions have been
  applied through Claude's Supabase connector.
- **New tables need `GRANT ... TO service_role`** explicitly in this
  project, or Edge Functions are refused. See
  `supabase/migrations/20261014101000_service_role_grants.sql`.
- Checks before shipping: `npx vitest run`, `npm run check-migrations`,
  and `npm run typecheck` inside each app.
