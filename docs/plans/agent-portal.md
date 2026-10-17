# Plan: agent portal redesign (agent-portal/design_handoff_agent)

Status: done on 2026-10-17 (see docs/HANDOFF.md, "Agent portal redesign"). Waiting on deployment.

Follow the handoff README; the HTML
prototype (`MiliPay Agent.dc.html`) wins where they disagree.

## What exists

- Routes: `agent-portal/src/app/App.tsx`. Pages and layout in
  `packages/shared`. `AgentLayout` is still the old dark shell; admin and
  support already use `components/layout/AppShell.tsx`, which has an
  `agent` portal mode.
- Backend agents already use: `staff_customers` / `staff_customer_detail`
  and `staff_merchants` / `staff_merchant_detail` (agents see only their
  own records), `enrol-customer`, `verify-identity` (NIMC),
  `onboard-merchant`, `approve-customer` / `reject-customer`.

## Work, in order

1. **Shell.** `AgentLayout` on `AppShell` with nav groups Work (Dashboard,
   Find customer, Register customer, Upgrade to Tier 2, Register merchant),
   Records (My registrations, Merchants), Performance (Earnings,
   Leaderboard). Sign-in stays `LoginPage portal="agent"` with staffMfa.
2. **Migration `agent_portal`.**
   - `agent_commission_rates` (customer ₦200, upgrade ₦300, merchant
     ₦1,000; placeholders to confirm), `agent_payouts`.
   - `customers.upgraded_by`, `customers.upgraded_at`;
     `pos_terminals.held_by` (an agent's stock).
   - RPCs, all `assert_staff(ARRAY['agent','admin','super_admin'])`:
     `agent_home`, `agent_find_customers(q)`, `agent_registrations(tab)`,
     `agent_earnings`, `agent_leaderboard(period)`, `agent_stock`,
     `agent_assign_terminal(terminal, merchant)` (audited).
   - Explicit `GRANT ... TO service_role` on new tables.
3. **Upgrade to Tier 2.** New `agent-upgrade` Edge Function: send an SMS
   code to a Tier 1 customer, then verify it with the palm capture, enrol
   the palm, and move them to Tier 2 (`upgraded_by`). Audited.
4. **Pages.** Dashboard (target ring, earnings, rank, needs attention,
   recent), Find customer, My registrations (tabs + drawer), Merchants
   (cards, merchant drawer, terminal stock + drawer), Earnings, Leaderboard,
   Upgrade flow. Restyle Register customer (6 steps), Register merchant and
   Fix and resubmit onto the new tokens.
5. **Tests** in `tests/agent-portal.test.ts`: RPCs assert the role and are
   revoked from anon; commission and leaderboard maths; upgrade function.
6. Update `docs/HANDOFF.md`, commit, push. Deploying the migration and
   functions waits on the Supabase CLI login (see the handoff).

## Not in this round

- Real bank account name lookup and NIMC photo: use the existing
  `verify-identity` / `onboard-merchant` paths as they are.
- Palm and face capture stay simulated in the browser until the FP08PV
  tablet's SDK is wired, as with the POS app.
