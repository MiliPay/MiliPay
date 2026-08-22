# MiliPay Admin Console

A from-scratch rebuild of the agent/admin console, structured for a team
and a userbase that are both going to get a lot bigger.

## Why it's organized this way

```
src/
  app/                  App.tsx (router) and ProtectedRoute. Nothing else.
  pages/                One folder per route. Pages compose features + ui.
    onboarding/
    login/
    dashboard/
    register-customer/
    settings/
  features/             Business logic, grouped by domain — not by file type.
    auth/                 AuthContext, role resolution
    customers/            API calls + (eventually) hooks for customer data
    transactions/         API calls for transaction data
  components/
    ui/                  Dumb, reusable primitives: Button, Input, Select,
                         Card, StatusBadge, FingerprintScanner. No business
                         logic, no API calls. These are your design system.
    layout/              Sidebar, MobileNav, LiveLedgerStrip — structural,
                         app-specific, but still no business logic.
  lib/
    api/client.ts        The ONE place that calls fetch(). Swap auth scheme,
                         base URL, or error handling here — once.
    utils/               Pure functions: formatting, validation. Unit-testable
                         with zero React involved.
    constants.ts         Shared constants (states, route paths).
  types/                 Domain types — Customer, Transaction, etc. The
                         single source of truth for what these things are.
  styles/index.css       Tailwind entry + the two global rules that matter
                         (font stack, prefers-reduced-motion).
```

### Why feature folders, not type folders

A `components/`, `pages/`, `hooks/`, `utils/` split (sorted by *what kind of
file it is*) works fine at 10 screens. It falls apart at 100, because
"everything about customers" ends up scattered across five folders. Sorting
by *domain* (`features/customers`, `features/transactions`) means a new
engineer opens one folder and sees the whole customer story: API shape,
validation, eventually hooks and tests.

`pages/` and `components/ui/` are the exception — routes and generic
design-system primitives genuinely are sorted well by "what kind of thing,"
so they stay that way.

### Why there's an API client layer instead of `fetch()` in components

Right now `features/customers/api.ts` and `features/transactions/api.ts`
return mock data with a fake delay. The function signatures
(`fetchCustomers(page)`, `registerCustomer(draft)`) are already what they'll
be once Firebase Functions exist — only the function *bodies* change.
No component ever needs to be touched when the backend goes live.

### Why money is `amountKobo: number`, never a float

`2000.50` as a JS float can drift during arithmetic. Storing kobo
(1/100 naira) as an integer and formatting only at render time
(`formatNaira()`) is the standard fix used by every payments system at scale —
Stripe does the same thing in cents.

### Why `StatusBadge` always renders a dot + word

At 100M users you cannot assume every admin can distinguish red from green
reliably, and color alone fails accessibility audits. The word is the
source of truth; the dot is a glance-able accent.

### The one signature element: `LiveLedgerStrip`

Most fintech dashboards default to a static "recent activity" card. The
ledger strip ticks rows in on load and is built to later attach to a
websocket/Firestore listener with zero markup changes — it's meant to feel
like watching a live rail, not a refreshed table.

## Design tokens

Defined once in `tailwind.config.js`, used everywhere as Tailwind classes —
never hardcoded hex values in components.

| Token | Hex | Use |
|---|---|---|
| `ledger` | `#080C0A` | App background |
| `ledger-raised` | `#0A1F1A` | Cards, sidebar |
| `ledger-line` / `ledger-line2` | `#1A3A30` / `#234539` | Borders |
| `signal` | `#00C896` | Primary action, live indicators |
| `signal-bright` | `#33E0B5` | Hover states, active nav |
| `ink` / `ink-muted` / `ink-faint` | `#E8FFF6` / `#86B3A4` / `#4F7568` | Text hierarchy |
| `status-ok` / `status-warn` / `status-fail` | green / amber / red | Status, always with a label |

Fonts: **Space Grotesk** (headings, the one display face), **Inter** (body),
**IBM Plex Mono** (every ID, phone number, BVN, and amount — anything that's
data reads as data, not prose).

## Running it

```bash
npm install
cp .env.example .env   # fill in real values when ready
npm run dev
npm run typecheck      # catches type errors before you ship them
npm run build
```

## Security rules baked in (do not relax these)

- `.env` is git-ignored. Only `VITE_*` keys that are safe in a browser
  bundle belong there — Mono/Flutterwave **public** keys, Firebase client
  config. Secret keys (`FLUTTERWAVE_SECRET_KEY`, `MONO_SECRET_KEY`,
  `TERMII_API_KEY`) must live only in Firebase Functions config, never here.
- PINs are never sent to, stored in, or logged by this frontend. The
  customer's PIN is hashed server-side and compared server-side — this app
  only ever collects it and forwards it over HTTPS to the auth endpoint.
- Fingerprint capture only ever surfaces a boolean (`fingerprintCaptured`)
  and a timestamp to the UI layer. The raw biometric template is the
  backend's concern entirely.

## What's mocked right now, and where to plug in real data

| File | Mocked | Replace with |
|---|---|---|
| `features/customers/api.ts` | In-memory array | Firebase Function / Firestore query |
| `features/transactions/api.ts` | In-memory array | Firestore `onSnapshot` listener for true "live" behavior |
| `features/auth/AuthContext.tsx` `resolveMockRole` | String match on phone input | Firebase Auth custom token + role claim |
| `RegisterCustomerPage` fingerprint scan | `setTimeout` | Real scanner SDK callback |