# Plan: agent locations with NIPOST digital postcodes

Status: planned 2026-10-14, not started. Waiting on NIPOST registration
(see "Before we start").

## Why

The website's Find an agent filters by state only, and `agent_locations` has
just a name, free-text address, state and hours. Customers can't find the
agent nearest them.

NIPOST launched the National Digital Postcode on 2026-10-01: an 11-character
code per building, e.g. `FC02A09DB09`, read as five segments:

| Segment | Example | Meaning |
|---|---|---|
| 1 | `FC` | State (2 letters) |
| 2 | `02` | LGA within the state (2 digits) |
| 3 | `A09` | District within the LGA (3 characters) |
| 4 | `DB` | Area within the district (2 letters) |
| 5 | `09` | Building within the area (2 digits) |

Because the code nests, two codes that share a prefix are near each other.
That lets us rank agents by closeness to a customer's postcode with no API
call at all.

## What NIPOST offers (docs.postcode.gov.ng)

- Base URL `https://api.postcode.gov.ng`, key in the `X-API-Key` header.
- Keys: `nipost_test_` / `nipost_live_` (secret, server only) and
  `nipost_pk_test_` / `nipost_pk_live_` (publishable, allowlisted origins,
  capped at lookup level 3). Live keys need verified KYB. One active test
  key per organisation. Test keys only resolve a small sample of places.
- Free: search and autocomplete; `GET /v1/search/nearby?lat&lng&radius`
  (default 300 m); reverse geocode (point → nearest building, 25 m default,
  250 m max); assemble/disassemble/validate; list states and LGAs; Lookup L1
  (is the code valid).
- Paid, by credits: Lookup L2 (official and recent house address), L3
  (building in use), L4 (other building details). L5 (coordinates) needs
  special approval.
- Rate limits per key (example limit 600); errors 401, 402 out of credits,
  403 level not granted, 429.
- Widgets for web, React Native, Flutter, Android and iOS.

Known rough edges: launched two weeks ago; nationwide coverage targeted for
December 2026; access opened in waves; prices unpublished; the docs say both
11 and 12 characters (the 12th is a space); third-party developers report
endpoints described as keyless returning 401.

## Design

**Rule: use only NIPOST's free features.** No paid lookups. Coordinates come
from the shop's Google Maps link, not NIPOST's restricted L5.

### Database (new migration)

On `public.agent_locations`, add:

- `postcode text` (nullable): canonical 11 characters, uppercase, no spaces.
  Check `^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z]{2}[0-9]{2}$`.
- `lga text` (nullable).
- `lat`, `lng` `double precision` (nullable, both or neither, within
  Nigeria's bounds).
- `postcode_checked_at timestamptz`: when NIPOST last confirmed the code.
- Index on `postcode`, and on `(state, lga)` where active.

Update `admin_save_agent_location` (today: id, name, address, state, hours)
to take the new fields, keeping the existing audit event. Keep the old
signature working until the admin page has moved over.

Reminder: new tables in this project need explicit `GRANT ... TO
service_role` (see `20261014101000_service_role_grants.sql`). These are
columns on an existing table, so no new grant should be needed.

### `website` Edge Function

- `GET /agents?state=&lga=`: adds LGA filtering, plus `lga`, `postcode`,
  `lat` and `lng` in the response. Never staff data.
- `GET /agents/near?lat=&lng=`: the closest active agents by straight-line
  distance (computed in SQL; PostGIS isn't needed at this scale), with the
  distance in km.
- `GET /agents/postcode?code=`: validates the shape locally, then ranks
  agents by shared prefix: same area, then same district, then same LGA,
  then same state. No NIPOST call.
- `POST /admin/resolve-postcode` (admin JWT only): server-side NIPOST
  reverse geocode from lat/lng, so the secret key never reaches a browser.
  Returns the postcode, or "not covered yet".
- Shared, pure helpers in `supabase/functions/_shared/postcode.ts`:
  `normalisePostcode`, `splitPostcode`, `postcodeCloseness`, `parseMapsLink`
  (pull lat/lng out of Google Maps URLs) and `distanceKm`. Same pattern as
  `_shared/website.ts`, so the site, the function and the tests share them.
- New secret: `NIPOST_API_KEY`, set per environment (test key in dev and
  staging, live key in production only). Without it, postcode
  auto-fill is skipped and everything else still works.

### Admin portal (Website › Agent locations)

- New fields: LGA (select), "Google Maps link" (we read the coordinates and
  show a small map pin preview), postcode (filled in automatically from the
  coordinates through the function, still editable), with a "Check with
  NIPOST" button.
- The list shows the postcode and a "not on the map yet" warning for
  locations without coordinates.

### Website (Help › Find an agent)

Three ways in, same results card:

1. **Use my location:** browser geolocation → `/agents/near`, sorted by
   distance, "1.2 km away".
2. **State and LGA:** today's state select plus an LGA select.
3. **Your postcode:** an input that accepts the 11 characters with or
   without spaces → `/agents/postcode`. A short hint links to
   postcode.gov.ng/find for people who don't know theirs.

Each agent shows its postcode and a "Get directions" link to Google Maps.

### Tests

- `postcode.ts` helpers: normalising, segment split, closeness ranking,
  Maps link parsing (several URL shapes), distance.
- The function, run against the fake Supabase: LGA filter, near-me ordering,
  postcode ranking, and the resolve endpoint refusing non-admins and
  working without `NIPOST_API_KEY`.
- Static SQL checks on the migration (constraints, audit, no anon access).

## Before we start (founder)

1. Register MiliPay on NIPOST's developer dashboard
   (postcode.gov.ng, "Get API access") with the MiliPay company details.
2. Complete KYB there (needed for live keys).
3. Create a **test** secret key and add it as `NIPOST_API_KEY` in the
   development Supabase project's secrets. Never in chat or a `.env` file.
4. Later: a live key in the production project only.

The build doesn't have to wait for steps 1–3. Everything except the
automatic postcode fill works without NIPOST, and that piece can be switched
on when the key arrives.

## Order of work

1. Migration and `_shared/postcode.ts` with tests.
2. `website` function endpoints and tests.
3. Admin page fields.
4. Website Find an agent.
5. Deploy to development, check end to end, then staging and production
   with the rest of the environment move.
