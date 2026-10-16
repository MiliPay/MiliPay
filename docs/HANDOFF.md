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

## The plan we agreed: MiliPay owns everything, three environments

Today one Supabase project on the founder's personal account serves
everything, including test work. That has to end before real customers
arrive. Decided on 2026-10-14 and updated the same day: **everything moves
to accounts MiliPay owns**, none on personal accounts.

- **Stay on Supabase**, as three projects. A self-built stack (own servers,
  load balancers, several databases) is not needed now and would mean
  rebuilding sign-in, database rules, functions and realtime chat. The
  database is plain PostgreSQL, so moving later stays possible.
- **GitHub:** the repo moves to a MiliPay GitHub organisation (transfer
  keeps history, issues and redirects the old URL).
- **Supabase, all under MiliPay:**
  - **Development:** free. Test data, sandbox keys. Replaces the current
    personal project, which retires once nothing points at it.
  - **Staging:** free. Sandbox keys. The last check before production.
  - **Production:** the only paid project (Pro or higher). Live keys only,
    daily backups with point-in-time restore, connection pooling, region
    nearest Nigeria (it can't be changed later).
  - Supabase bills per organisation: every project in a paid organisation
    is charged compute. To keep dev and staging free, put them in a
    separate free organisation (e.g. "MiliPay Dev"), both owned by MiliPay.
    Check Supabase's current pricing when creating them.
- **Firebase, under MiliPay:** hosting for the website and portals, and
  Firebase Cloud Messaging for Android push. Push is sent through Expo's
  push service (`supabase/functions/_shared/push.ts`), which delivers to
  Android with a Firebase key uploaded to the Expo project. The Expo
  project (`mobile-app/app.json`, projectId `4b20c2a7…`) and the Apple push
  key should move to MiliPay accounts too.
- **Changes flow one way:** dev → staging → production, through GitHub
  Actions, never applied to production by hand.
- **Growth later, as traffic needs it:** Redis cache (rate limits, hot
  reads), Supabase read replicas, a queue for bill-payment fulfilment, and
  only if Supabase becomes the limit, PostgreSQL on AWS with load balancers.

### Waiting on the founder

Create every account with a MiliPay company email, at least two owners, and
two-factor sign-in for everyone.

1. **GitHub:** create a MiliPay organisation, then transfer
   `Alashabeeb/BioPay` into it (repo Settings › Transfer ownership).
2. **Supabase:** a paid organisation with **milipay-production**, and a
   free organisation with **milipay-development** and **milipay-staging**.
   Same region for all three, nearest Nigeria. Billing on a company card.
3. **Firebase:** a MiliPay project under the company Google account (two
   projects if you want staging hosting separate from production).
4. **Expo:** a MiliPay organisation; transfer the app's Expo project into it.
5. Give Claude access: invite your personal accounts into the MiliPay
   organisations, or reconnect Claude's Supabase connector and sign in to
   Firebase and GitHub with the company accounts.
6. Enter live Mono, VTPass, Termii and Smile ID keys yourself in the
   production project's secrets. Never in chat, never in a `.env` file.
7. **NIPOST digital postcode:** register MiliPay on the developer dashboard
   at postcode.gov.ng and complete KYB with the company details. Then add a
   test key as `NIPOST_API_KEY` in the development project's secrets (and,
   later, a live key in production only). Used by the agent-locations plan.

### Then Claude does

1. Apply all migrations to development and staging, check them, then
   production.
2. Deploy every Edge Function to all three.
3. Point each app and portal at the right environment per build, and the
   repo at the MiliPay GitHub remote.
4. Move hosting to MiliPay Firebase and set up the Firebase push key in
   Expo.
5. Add GitHub Actions: staging on merge, production on approval.
6. Retire the personal Supabase project and the shared `aniyu-b841b`
   hosting once nothing points at them (only with the founder's OK).
7. Write the architecture document for the team or investors.

## POS terminal app (built 2026-10-16, not yet deployed)

From `merchant-portal/design_handoff_pos`: a new Expo app, `pos-app/`, for
the HF-HP605PV palm-vein terminal. Every screen in the design is built.

- **Run it:** `npm --prefix pos-app run web` (or the `pos` entry in
  `.claude/launch.json`). With no `EXPO_PUBLIC_SUPABASE_URL` it runs in
  demo mode with the prototype's shop (owner PIN 1234; customer PIN 0000 is
  "wrong", anything else approves).
- **Live:** set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_POS_SERIAL`.
  The terminal must be registered in Admin (POS terminals) with that serial,
  and the merchant needs a `director_phone` and portal password.
- **Backend:** `supabase/functions/pos` (device token + cashier PIN
  sessions), `_shared/pos.ts`, and `_shared/palm-checkout.ts`, now shared
  with `process-payment`. Migration `20261016090000_pos_terminal.sql`:
  `pos_cashiers`, `pos_refunds`, and `payment_method` / `cashier_id` /
  `used_pin` on transactions. Tests: `tests/pos.test.ts`.
- **Simulated until the terminal arrives:** palm scanner, printer and serial
  (`pos-app/src/hardware.ts` is the only file to replace with the vendor
  SDK). A simulated palm won't match, so live payments show "Payment
  couldn't be checked" until real templates come from the scanner.
- **Switched off:** QR (needs the customer app to make a signed one-time
  QR) and card (needs an acquirer). Their screens exist.
- **Refunds are requests:** the till marks a payment `refund_pending` with
  a supervisor's PIN; nothing yet sends the money back. Operations needs a
  screen to complete `pos_refunds`.
- **Cashiers:** the owner is created at first login. There's no screen yet
  to add more cashiers (merchant portal or admin).

## Other open items

- **Agent locations are empty**, so the website's Find an agent says "no
  agents listed". Add them in Admin › Website › Agent locations.
- **Agent locations with NIPOST digital postcodes** (planned, not started):
  LGA, map coordinates and the building postcode on each location; Find an
  agent by "near me", state + LGA, or postcode. Full plan:
  [docs/plans/agent-locations-postcode.md](plans/agent-locations-postcode.md).
  It can be built before the NIPOST key arrives; only the automatic
  postcode fill waits for it.
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
