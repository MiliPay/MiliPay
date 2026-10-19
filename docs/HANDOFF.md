# MiliPay: where the project stands

Read this first when picking the project up on a new machine or in a new
session. Last updated 2026-10-19.

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
| Supabase, what the live sites use until production moves to Nigeria | project `MiliPay`, ref `hkhnduxbxfcqjgrdnqcz`, eu-central-1, on the founder's personal account |
| Supabase development | `milipay-development`, ref `govynvmsdaeoxpktgjpn`, eu-west-1, organisation "MiliPay Dev" (free) |
| Supabase staging | `milipay-staging`, ref `klehplljqlxvfevvmwkp`, eu-west-1, organisation "MiliPay Dev" (free) |
| Firebase hosting | project `aniyu-b841b` (shared with another product, AniYu) |
| GitHub | https://github.com/MiliPay/MiliPay (organisation `MiliPay`), branch `main` |
| Expo | organisation `milipayltd`, project `biopay` |
| Firebase (MiliPay, empty for now) | project `milipay-f2459` |

All migrations in `supabase/migrations` are applied to all three Supabase
projects, and every function in `supabase/functions` is deployed to all
three (original project: last deploy 2026-10-17; development and staging:
everything on 2026-10-19). Admin, agent and support portal hosting last
deployed 2026-10-19 (staff profile editing); the website on 2026-10-17 or
earlier.

## Development and staging (set up 2026-10-19)

- **Which build talks to which project.** Web apps read
  `env/.env.<mode>` (shared `envDir` in each `vite.config.ts`):
  `npm run dev` → development, `npm run build:staging` → staging,
  `npm run build` → the original project (what Firebase serves). The mobile
  app takes `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` from its EAS profile
  (`development` → development, `preview` → staging, `production` → falls
  back to the original project). Only public values live in those files.
- **Migrations now rebuild a database from scratch.** They never had: the
  original project had been partly set up by hand. Fixed on 2026-10-19 in
  three already-applied files (the original project never re-runs them):
  `transactions` is a plain table keyed on `id`; the prototype `merchants`
  table is replaced; the old `linked_accounts` → `users` key is dropped
  before `users` goes. The first migration also creates `rls_auto_enable` +
  the `ensure_rls` event trigger (row security on for every new table),
  which Supabase only adds when a project is created with automatic RLS.
  Development and staging were compared after the push: same 45 tables (all
  RLS on), 78 policies, 133 functions, columns, 4 cron jobs, realtime tables.
- **Apply migrations** with the CLI, no database password needed:
  `npx.cmd -y supabase@2.121.0 link --project-ref <ref>` then
  `npx.cmd -y supabase@2.121.0 db push --linked`. Before the first push to a
  new project, store its own address in Vault, or the VTU sweep cron calls
  the original project:
  `select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url', '');`
  (`link` rewrites the tracked `supabase/.temp` files; restore them with
  `git checkout -- supabase/.temp` before committing.)
- **Function settings already set** on both (sandbox, nothing secret):
  `MILIPAY_ENVIRONMENT=sandbox`, `VTU_FULFILMENT_MODE=disabled`,
  `VTPASS_BASE_URL` (sandbox), `MONO_BASE_URL`, `MONO_PAYMENT_MODE=directpay`,
  `IDENTITY_VERIFICATION_MODE=simulated`, `SMILE_ENVIRONMENT=sandbox`,
  `ALLOW_SIMULATED_BIOMETRICS=true` (no scanner yet, no real customers),
  Termii sender names, `VTPASS_WALLET_FLOOR`. `PASSWORD_DELIVERY_CHANNELS`
  is `whatsapp,sms,console` in development (one-time passwords land in the
  function log when Termii isn't set) and `whatsapp,sms` in staging.
- **Waiting on the founder, per project** (Supabase › Edge Functions ›
  Secrets; test/sandbox keys only): `MONO_SECRET_KEY`,
  `MONO_PAYMENTS_SECRET_KEY`, `MONO_PUBLIC_KEY`, `MONO_WEBHOOK_SECRET` (add
  the webhook `https://<ref>.supabase.co/functions/v1/mono-webhook` on
  Mono's test Payments app; it shows the secret), `VTPASS_API_KEY`,
  `VTPASS_SECRET_KEY`, `VTPASS_PUBLIC_KEY`, `TERMII_API_KEY`,
  `SMILE_PARTNER_ID`, `SMILE_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`.
  Once the VTPass sandbox keys are in, set `VTU_FULFILMENT_MODE=live` to run
  purchases end to end against the sandboxes. `PALM_MATCH_URL` waits for
  the matcher service. Also: Authentication › Sign In / Providers, turn off
  "Allow new users to sign up" (staff and customers are created by the
  server, never by public sign-up).
- **Staff accounts:** development has the founder as super admin
  (habeebullah.abdulhakeem@milipayz.com). Staging has none yet. To add a
  super admin by hand: create the user in Authentication › Users (Auto
  Confirm), then insert their `staff_profiles` row with role `super_admin`
  and set `raw_app_meta_data.role` on the auth user to match.
- **Development secrets:** only `TERMII_API_KEY` is a real key so far.
  `MONO_SECRET_KEY` and `EMAIL_FROM` also hold values the founder may not
  have meant to set (check). Staging has no provider keys yet.

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
- **Staff edit their own profile** (2026-10-19): name, phone and state in
  every staff portal (admin: My profile; agent and support: Settings, also
  reached from "My profile"); the email is shown locked and nothing can
  change it. Password changes apply at once. A super admin's own changes
  apply at once; an admin's need a super admin; an agent's or support's need
  an admin or a super admin; nobody decides their own. Approvals are on
  Admin › Staff ("Profile changes waiting for you", with a Staff badge);
  approve and reject both ask to confirm, reject needs a reason, all of it
  is audited. Migration `20261019090000_staff_profile_changes.sql` is on
  all three projects (the founder ran it in the live project's SQL editor),
  and the admin, agent and support portals were deployed with it on
  2026-10-19. Tests: `tests/staff-profile-changes.test.ts`; the rules were
  also run on the development database in a rolled-back transaction.
- Removed the July 2026 planning draft from the repo root
  (`milipay_doc.txt` and its `.docx`); the current company documents are
  in `Claude outputs/`.

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

### Production must be hosted in Nigeria (found 2026-10-19)

A CBN circular of 15 June 2026 requires payment transaction data
generated in Nigeria to be processed and stored in Nigeria by
**1 January 2027**. It binds licensed banks, switches and payment
providers, and reaches fintechs through their licensed partners.
Supabase's hosted cloud has no Nigerian region, so **production can't go
on hosted Supabase**. Dev and staging hold only test data and can stay on
hosted Supabase (free).

Proposed, not yet decided: run **self-hosted Supabase** (open source, so
sign-in, database rules, Edge Functions and realtime keep working without
code changes) on Nigerian infrastructure, e.g. a Lagos data centre (MDXi,
Rack Centre, Galaxy Backbone, Layer3, Cloudflex) or the AWS Lagos Local
Zone. Before choosing: a Nigerian fintech lawyer reads the circular itself
(scope, offshore backups, whether MiliPay is bound directly or through
partners), and the founder picks the provider. This replaces the paid
hosted production project in the plan above.

### Waiting on the founder

Create every account with a MiliPay company email, at least two owners, and
two-factor sign-in for everyone.

1. ~~GitHub~~ done 2026-10-19: org `MiliPay`, repo
   https://github.com/MiliPay/MiliPay.
2. ~~Supabase dev and staging~~ done 2026-10-19 (see "Development and
   staging" above; their sandbox keys are still to enter). Production is on
   hold: see "Production must be hosted in Nigeria" above.
3. ~~Firebase~~ done 2026-10-19: project `milipay-f2459` under the
   company Google account. Nothing is hosted there yet.
4. ~~Expo~~ done 2026-10-19: organisation `milipayltd`, project `biopay`
   (same projectId), and `owner` in `mobile-app/app.json` updated.
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

1. ~~Apply all migrations to development and staging~~ done 2026-10-19;
   production when it exists.
2. ~~Deploy every Edge Function to development and staging~~ done
   2026-10-19; production when it exists.
3. ~~Point each app and portal at the right environment per build~~ done
   2026-10-19 (`env/`, `eas.json`); production gets its own values when it
   moves.
4. Move hosting to MiliPay Firebase (`milipay-f2459`; `.firebaserc` still
   says `aniyu-b841b` until then) and set up the Firebase push key in Expo.
5. Add GitHub Actions: staging on merge, production on approval.
6. Retire the personal Supabase project and the shared `aniyu-b841b`
   hosting once nothing points at them (only with the founder's OK).
7. Write the architecture document for the team or investors.

## POS terminal app (built 2026-10-16; backend deployed 2026-10-17, app not yet built for the terminal)

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

## Agent portal redesign (built and deployed 2026-10-17)

From `agent-portal/design_handoff_agent`; plan in
[docs/plans/agent-portal.md](plans/agent-portal.md).

- **New screens** (`packages/shared/src/pages/agent/`): Dashboard (target
  ring, earnings, rank in your state, needs attention, recent), Find
  customer, My registrations (tabs, drawer, Fix and resubmit), Upgrade to
  Tier 2, Merchants (cards, merchant drawer, terminal stock and assign),
  Earnings, Leaderboard. Shell: `AgentLayout` on `AppShell`.
- **Backend:** migration `20261017090000_agent_portal.sql` (applied):
  `agent_commission_rates`, `agent_payouts`, `agent_upgrade_codes`,
  `customers.upgraded_by/upgraded_at`, `pos_terminals.held_by` (and
  `merchant_id` is now nullable for terminals in an agent's stock), RPCs
  `agent_home`, `agent_find_customers`, `agent_registrations`,
  `agent_earnings`, `agent_leaderboard`, `agent_stock`,
  `agent_assign_terminal`. Edge Function `agent-upgrade` (Tier 2 upgrade
  by SMS code + palm, and Fix and resubmit). Tests:
  `tests/agent-portal.test.ts`.
- **Commission rates are placeholders** (₦200 customer, ₦300 upgrade,
  ₦1,000 merchant). Confirm the real ones and change the
  `agent_commission_rates` rows. Payouts are recorded by finance in
  `agent_payouts`; there's no screen for that yet.
- **Terminal stock:** Admin › POS terminals › **Agent stock**
  (`/dashboard/terminals/stock`, `AgentStockPage`). Admins add new
  terminals to the warehouse or straight to an agent, give, move and take
  them back with a reason (audited). Migration
  `20261017110000_admin_terminal_stock.sql` (applied): `held_since`, RPCs
  `admin_stock`, `admin_stock_add`, `admin_stock_move`. The Terminals page
  and the offline badge now count only terminals at a merchant.
- **Register customer and Register merchant** (agent only; admin keeps its
  own pages): `AgentRegisterCustomerPage` (6 steps: phone + SMS code, NIN
  + date of birth with NIMC, contact with LGA, face, palm, review and
  consent) and `AgentRegisterMerchantPage` (business and owner, bank with
  "Check account name", location with "Use my location", terminal from
  stock or "Assign later", review with the CAC consent). Migration
  `20261017100000_agent_registration.sql` (applied): `agent_phone_checks`,
  `customers.phone_verified_at`, `merchants.latitude/longitude`.
  `enrol-customer` now **requires an agent to send a confirmed phone check**
  (admins exempt) and takes `lga`; `onboard-merchant` takes
  `terminalMode` new / stock / later and the coordinates. Tests:
  `tests/agent-registration.test.ts`.
- The NIMC photo slot is a placeholder: the identity provider doesn't
  return a photo yet. Bank name lookup works only when Mono's key is set.
- **Deploy together:** `enrol-customer` refuses agents who don't send a
  phone check, so a change to that rule and the agent portal go live
  together (as on 2026-10-17).

## Other open items

- **Agent locations are empty**, so the website's Find an agent says "no
  agents listed". Add them in Admin › Website › Agent locations.
- **Agent locations with NIPOST digital postcodes** (planned, not started):
  LGA, map coordinates and the building postcode on each location; Find an
  agent by "near me", state + LGA, or postcode. Full plan:
  [docs/plans/agent-locations-postcode.md](plans/agent-locations-postcode.md).
  It can be built before the NIPOST key arrives; only the automatic
  postcode fill waits for it.
- **Super admin login** is the founder's company email (changed from the
  sample address on 2026-10-17); same password and authenticator.
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
- **GitHub push** needs an account with write access to the `MiliPay`
  organisation. The first push on a new machine opens a browser sign-in
  (Git Credential Manager); run it yourself, then Claude can push.
- **Supabase CLI:** not installed globally. Log in with
  `npx.cmd -y supabase@2.121.0 login`, then deploy with
  `npx -y supabase@2.121.0 functions deploy <name> --project-ref <ref> --use-api`
  (no Docker needed). Older CLIs such as 2.48.3 refuse this repo's
  `config.toml` ("'auth' has invalid keys: phone"). Migrations go in with
  `db push --linked` (see "Development and staging"), **except on the live
  project**: its history was recorded by the connector under other version
  numbers, so `db push` refuses there. Run a new migration file in its SQL
  editor (or through the connector) instead; never "repair" its history. Claude's Supabase
  connector can be granted one organisation at a time; it's on "MiliPay
  Dev" since 2026-10-19.
- **Dependencies:** run `npm.cmd install` at the root and
  `npm.cmd --prefix mobile-app install` before the tests; 12 test files
  need the mobile app's packages.
- **New tables need `GRANT ... TO service_role`** explicitly in this
  project, or Edge Functions are refused. See
  `supabase/migrations/20261014101000_service_role_grants.sql`.
- Checks before shipping: `npx vitest run`, `npm run check-migrations`,
  and `npm run typecheck` inside each app.
