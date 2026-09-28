# Architecture

## Stack and why

The prior codebase for this project (described in earlier session notes: a Vite+React app with
a 3D "energy world") was not found on disk when this integration was built (see the delivery
note at the end of this document), so this is a fresh app, built specifically for the EIA
integration described in the project brief. It intentionally does **not** rebuild the 3D energy
world -- that is a separate, large piece of work out of scope for "connect real EIA data."

The one architectural decision worth calling out: **this had to become a small full-stack app,
not a static SPA.** The brief requires the EIA key to stay server-side, never reach the client,
and never be embeddable in a publicly shared static page. A pure client-side single-file bundle
cannot satisfy that -- there is no server to hold the secret. So the app is:

- **`src/`** -- a Vite + React + TypeScript client (the UI).
- **`server/`** -- a small Express + TypeScript API that holds `EIA_API_KEY` and proxies/normalizes
  EIA data. In dev, Vite's dev server proxies `/api/*` to Express (`vite.config.ts`); in
  production, build both and run the Express server, serving the built client's static files (or
  put them behind your own static host / CDN with the API server behind `/api`).
- **`shared/`** -- TypeScript types shared by both (the normalized data model, Demand Stack types).

## Data source architecture

```
EnergyDataAdapter (interface, server/lib/adapters/types.ts)
  |-- EiaDataAdapter   (server/lib/adapters/eiaAdapter.ts)   -- live EIA API v2
  \-- DemoDataAdapter  (server/lib/adapters/demoAdapter.ts)  -- synthetic, labeled, offline
```

`server/lib/adapters/registry.ts` selects the adapter from `ENERGY_DATA_ADAPTER` and falls back
to `DemoDataAdapter` automatically when `EIA_API_KEY` is missing or an EIA request fails (with a
clear `demonstration` quality status and reason string in the response, never silently). Adding
a third source (NREL, EPA eGRID, an ISO/RTO feed, a utility filing, a customer CSV) means writing
one more class that implements `EnergyDataAdapter` -- no route or UI change required. A
`LocalCsvAdapter` was not built in this pass (kept out per the brief's "don't ingest everything
before slice 1 works"), but the interface already supports it: implement `fetchHourlyDemand` /
`fetchStateOverview` by reading and normalizing a CSV instead of calling `fetch()`.

Raw EIA rows are only ever shape-matched inside the adapter (`EiaRegionDataRow`, private to
`eiaAdapter.ts`). Everything past the adapter boundary uses `NormalizedEnergyRecord`
(`shared/types/energy.ts`) -- routes, calculations, and the UI never see an EIA field name.

## EIA API v2 routes and facets used

Confirmed against the live EIA v2 API metadata on 2026-09-27 (not guessed):

- **`electricity/rto/region-data`** -- hourly demand/forecast/net-generation/interchange by
  balancing authority, from Form EIA-930. Used for all hourly grid profiles.
  - `frequency=hourly` (UTC; we convert to local ourselves, see Timezone handling below)
  - `facets[respondent][]` -- the balancing-authority code, e.g. `PJM` (validated list: see
    `server/lib/geo/balancingAuthorities.ts` header)
  - `facets[type][]` -- `D` (actual demand) or `DF` (day-ahead forecast); `NG`/`TI`
    (net generation / interchange) are mapped in the normalized schema but not surfaced in the UI
    in this pass
  - `data[]=value`, units are MW
- **`electricity/retail-sales`** -- state-level price/sales/customers/revenue by sector.
  Used for the state overview.
  - `frequency=annual`
  - `facets[stateid][]` -- 2-letter state code (all 50 + DC confirmed present)
  - `data[0]=price&data[1]=sales&data[2]=customers&data[3]=revenue` -- **must use indexed array
    syntax**, not repeated `data[]=`; EIA v2 silently returns only the first requested column
    otherwise (no error). See "Live EIA verification" below.

Both were fetched live via `WebFetch` against `api.eia.gov` during this build (metadata and facet
endpoints) since this sandbox's own outbound network does not reach `api.eia.gov` -- see
"Live EIA verification" for what that means for testing and what was found and fixed as a result.

## Geographic registry and the state-to-BA mapping

`server/lib/geo/`:
- `states.ts` -- all 50 states + DC, with every IANA timezone each touches.
- `balancingAuthorities.ts` -- every entry's `id`/`name` came verbatim from the live EIA
  `respondent` facet on `electricity/rto/region-data`. EIA does **not** publish a
  BA-to-state mapping as data, so the `states: string[]` on each entry is a **curated** mapping
  built from public knowledge of each BA/ISO's service territory -- documented as an assumption,
  not source data. It covers the major ISOs/RTOs and ~50 utility/municipal/federal BAs across all
  48 contiguous states + DC. A handful of very small or ambiguous EIA respondents (e.g. some wind
  BAs, transmission-only utilities) were deliberately left out rather than guessed.
- `regionRegistry.ts` -- combines the two into one entry per state, with a `coverage` status:
  - `hourly_and_state` -- has both a state overview and at least one mapped hourly BA
  - `state_only` -- Alaska and Hawaii; their grids are outside EIA-930's Lower-48 coverage, so no
    hourly curve is offered (never fabricated)
  - `not_yet_mapped` -- reserved for a state with no curated BA yet (none currently; all 48
    contiguous states + DC have at least one)

### Adding a state mapping

1. Look up the BA's id/name on the live facet:
   `https://api.eia.gov/v2/electricity/rto/region-data/facet/respondent?api_key=...`
2. Add an entry to `BALANCING_AUTHORITIES` in `balancingAuthorities.ts` with that `id`/`name`
   verbatim, `verifiedAgainstEia: true`, and your best-sourced `states` list.
3. The module self-validates at import time (throws if a state abbreviation is unknown), so a
   typo fails immediately rather than silently.

### Adding a new region (a whole new geography, e.g. a future non-US territory)

Extend `StateInfo`/`StateRegionEntry` in `shared/types/energy.ts` if the new geography doesn't
fit "state + balancing authority" (e.g. a country + grid operator), add a registry file mirroring
`geo/`, and point `regionRegistry.ts`'s consumers at the new registry -- the adapters, routes, and
UI all consume `StateRegionEntry`, not geography-specific types.

### Adding another data adapter

Implement `EnergyDataAdapter` (`server/lib/adapters/types.ts`): `fetchHourlyDemand` and
`fetchStateOverview`, returning `NormalizedEnergyRecord[]` / `StateOverview` with real
`Provenance`. Register it in `registry.ts`'s `selectAdapter()`. Nothing else changes.

## Rate schedule data source (OpenEI URDB)

```
RateDataAdapter (interface, server/lib/adapters/rateAdapterTypes.ts)
  |-- UrdbDataAdapter  (server/lib/adapters/urdbAdapter.ts)   -- live OpenEI Utility Rate Database
  \-- RateDemoAdapter  (server/lib/adapters/rateDemoAdapter.ts) -- frozen REAL snapshot, offline
```

A second, independent data source, added to answer "what does this utility actually charge, and
does its price vary by time of day" -- separate from EIA's load/demand data. Same discipline as the
EIA adapter: `server/lib/adapters/rateRegistry.ts` selects `UrdbDataAdapter` when `OPENEI_API_KEY`
is configured, else falls back to `RateDemoAdapter` with a clear reason string; never a raw error to
the client. `GET /api/energy/rate-schedules?state=VA&sector=Residential` (`server/routes/rateSchedules.ts`)
is the route, cached 7 days via the same `FileCache`.

`server/lib/geo/utilities.ts`'s `DEFAULT_UTILITY_BY_STATE` is the curated state -> utility mapping
(the `eiaid` join key, URDB's own "which utility" id -- a **different id space** from the
balancing-authority id like `PJM` used elsewhere in this app; both are informally called "EIA IDs"
but are not interchangeable). It deliberately starts with **only Virginia** (`eiaid: 19876`,
confirmed live), the same "don't guess a mapping" discipline as `DEFAULT_BA_BY_STATE`.

`server/lib/rates/scheduleAnalysis.ts` normalizes URDB's raw shape (`UrdbRateRaw`) into
`shared/types/rates.ts`'s `RateSchedule`/`RatePeriod`/`RateTier`: effective rate = `rate + adj`;
`hasTimeOfUse` is true only when a schedule's price genuinely changes *within* a day (not just
season-to-season -- see the live findings below); periods are classified `on_peak`/`off_peak`/
`mid_peak`/`flat` by comparing their representative (lowest-tier) rate against the schedule's other
periods, only when `hasTimeOfUse` is true.

### Live URDB verification (this session)

Real, live queries were made against `api.openei.org/utility_rates` (via `WebFetch`, for the same
network-allowlist reason described in "Live EIA verification") with the user's own OpenEI key. Three
real, load-bearing findings came directly out of that live testing, none of them guessed:

1. **URDB keeps every historical version of a rate forever.** A query with no date filter returns
   years of expired tariffs mixed in with the current one. **Fix**: every result is filtered to
   `enddate === null` (still active) client-side (`isCurrentlyActive` in `scheduleAnalysis.ts`).
2. **One `eiaid` can carry rate filings for more than one state-specific legal-entity name.**
   `eiaid: 19876` returns rows for both `"Virginia Electric & Power Co"` and
   `"Virginia Electric & Power Co (North Carolina)"` -- filtering by `eiaid` alone would silently mix
   in the wrong state's tariffs. **Fix**: `UrdbDataAdapter` filters by exact `utility` name match too,
   confirmed with a regression test in `urdbAdapter.test.ts`.
3. **URDB does not flag any Dominion Virginia residential rate `is_default: true`** -- confirmed by
   fetching every currently-active Virginia residential rate directly; the field is simply absent
   from all of them. This app never fabricates a default in that gap: `inferPrimarySchedule` in
   `scheduleAnalysis.ts` picks the sole non-specialty-named candidate (excluding names matching
   "experimental", "TOU", "EV", "water heating", "off-peak plan", "demand") only when there is
   exactly one; otherwise `defaultSchedule` is `null`. Either way, `qualityFlags` records what
   happened (`default_inferred_not_source_flagged` or `no_default_identified`), and the UI (Rate
   Explorer) surfaces that flag rather than presenting an inferred choice as sourced fact.

A fourth finding shaped the Demand Stack engine itself: Dominion's real, currently-active residential
TOU rate (**"Residential Energy TOU Schedule 1T"**) has **two separate on-peak blocks per weekday**
in the non-summer months (6:30am-noon and 5-9pm), which a single contiguous
`peakWindowStartHour`/`peakWindowEndHour` range cannot represent. `RatesAssumptions.peakHours?: number[]`
was added (additive, optional) to `shared/types/demandStack.ts`, and `demandStackEngine.ts`'s
`applyRates()` uses it in place of the start/end range whenever it's present and non-empty --
covered by a dedicated test in `demandStackEngine.test.ts`.

The offline/no-key fallback (`RateDemoAdapter`) is not synthetic: `server/lib/rates/demoRateFixture.ts`
freezes the exact real rate data captured live on 2026-09-27 (Dominion's standard flat/seasonal rate
and its real TOU alternative), so "demonstration mode" for rates still shows genuine Dominion numbers,
just not guaranteed to reflect the current live rate.

## Normalized data model

`shared/types/energy.ts`: `NormalizedEnergyRecord`, `StateOverview`, `LoadProfile`, and the
`ApiEnvelope<TData>` response shape (`data` / `summary` / `provenance` / `quality` / `cache`) used
by every `/api/energy/*` route. `shared/types/demandStack.ts`: the Demand Stack assumptions and
results types, including the fixed `HourlyStackResult` arrays
(`baselineMw` / `efficiencyReductionMw` / `ratesAdjustmentMw` / `demandResponseReductionMw` /
`resultingLoadMw`) called for in the brief.

## Timezone and DST handling

`server/lib/timezone.ts`, built on `date-fns-tz`:
- EIA gives UTC; we store UTC (`timestampUtc`) and derive local (`timestampLocal`) with
  `utcToLocalIso`, never the reverse.
- `hoursInLocalDay(date, tz)` computes 23/24/25 from the actual UTC gap between local midnights
  for that specific date/timezone -- not a hardcoded DST calendar, so it's correct for any US zone
  without maintenance.
- `buildTypicalWeekdayProfile` / `buildDateRangeAverageProfile` (`server/lib/loadProfile.ts`)
  deliberately **exclude** 23/25-hour DST-transition days from hour-by-hour averages (averaging a
  23-hour day against 24-hour days hour-for-hour would silently misalign the shape) and report
  the exclusion via `sourceDaysUsed` being smaller than the season's day count.
- A single-day profile (`custom_date`/`peak_day`) keeps whatever hour count that day actually
  has and reports it via `summary.hoursInDay` / `summary.isDstTransitionDay`.
- The Demand Stack engine always operates on exactly 24 hourly values (a fixed-size array is
  simplest to reason about and test). `src/lib/hourlyArray.ts` normalizes a profile's points into
  24 by interpolating a missing DST hour or dropping a repeated one -- disclosed in the
  methodology panel, not hidden.
- Tests: `server/lib/timezone.test.ts` covers a normal day, a 23-hour spring-forward day
  (2025-03-09), a 25-hour fall-back day (2025-11-02), a non-DST zone (Arizona), summer/winter
  offset differences, and an invalid-timestamp throw.

## Data quality

`server/lib/quality/validate.ts`'s `checkHourlyQuality`: flags (never silently drops, except true
duplicate timestamps, which keep the first occurrence) missing/duplicate/invalid timestamps,
non-numeric or negative values, extreme outliers (>250,000 MW), and gaps in the hourly sequence.
Overall status is one of `complete` / `complete_with_warnings` / `partial` / `stale` /
`unavailable` / `demonstration`, computed from what share of the expected hourly timeline is
actually present -- not just how many raw rows came back.

## Caching

`server/lib/cache.ts`: an `EnergyCache` interface with a dev-only `FileCache` (JSON files under
`.cache/energy/`, key = dataset + sorted params, hashed) and an in-memory `MemoryCache` used by
tests. Cache entries carry `retrievedAt`/`expiresAt`/`requestParams`/`sourceKey` -- no secrets.
TTLs: 6h for hourly load-profile data (effectively immutable once EIA posts it, but a
conservative window in case of upstream corrections), 24h for state-level annual data. On an
upstream failure, a **stale** cache entry is served (labeled `stale` in the response) before
falling back to demonstration data, so a temporary EIA outage degrades gracefully in three steps:
fresh -> stale-but-real -> demo, never a dead end.

Swap `FileCache` for Postgres/Supabase/Redis by implementing the same `EnergyCache` interface and
changing the one `new FileCache(...)` call site per route.

## Server API

Routes (`server/routes/*.ts`, mounted at `/api/energy/*` in `server/index.ts`):
`GET /regions`, `GET /state-overview`, `GET /load-profile`, `GET /peak-days`,
`GET /source-status`, `GET /rate-schedules` (OpenEI URDB rate schedules, see below), and
`POST /demand-stack` (the calculation engine, exposed so client and any
future export/report job share exactly one implementation). All validate input with `zod`, return
the shared envelope shape, and never throw an unhandled error to the client (centralized error
handler in `index.ts`). A tiny in-memory per-IP rate limiter (120 req/min) sits in front of all
`/api/energy/*` routes. `GET /api/energy/dev/diagnostics` is mounted only outside production
(`NODE_ENV !== "production"`) and never exposes the key itself, only whether one is configured.

## Representative-day methodology

- **Peak day**: the single local calendar day containing the year's highest hourly value.
- **Typical summer/winter weekday**: average of each local hour across all *complete* (24-hour),
  non-weekend days in Jun-Aug / Dec-Feb.
- **Custom date**: a specific local calendar date, as reported (any hour count).
- **Date-range average**: average of each local hour across all complete days in the given range.

## Demand Stack formulas (v1)

`server/lib/demandStackEngine.ts`. Order is fixed and layers act sequentially on what's left after
the layer before them -- Efficiency, then Rates & Behavior, then Demand Response (blue/green/
yellow):

1. **Efficiency**: `reduction[h] = baseline[h] * pct/100`, every hour.
2. **Rates & Behavior**: removes `shiftPct%` of (post-efficiency) demand from each hour in the
   configured peak window; redistributes the removed total to off-peak hours in proportion to
   their own baseline share (so it lands where load already runs higher, not as a flat spike);
   if `conservationEnabled`, only `(1 - conservationPct/100)` of the removed total is
   redistributed -- the rest is a genuine net reduction, not just a shift. Total daily energy is
   preserved exactly when conservation is off (tested).
3. **Demand Response**: `min(availableCapacityMw * participation% * performance%, remaining load)`
   removed for each hour in the event window (wraps past midnight correctly).

`resultingLoadMw[h] = max(0, baseline[h] - efficiency[h] + ratesAdjustment[h] - dr[h])` -- floored
at zero every hour (tested with deliberately extreme stacked assumptions).

Every `LayerContribution.valueClass` is `"calculated"` (derived from assumed inputs + the
observed/demo baseline); the UI separately badges the baseline as observed/demo and each layer's
inputs as modeled assumptions -- see `SourceBadge`/`QualityBadge` in `src/components/`.

## Observed / assumed / calculated

- **Observed**: baseline hourly values from EIA (or, in demo mode, clearly labeled demonstration
  data -- never presented as observed).
- **Assumed**: every Demand Stack input (efficiency %, shift %, participation %, etc.) -- always
  user-configurable, always shown with its value in the methodology/results text.
- **Calculated**: peak reduction, energy reduced/shifted, resulting load, layer contributions --
  derived from the two above.

## Exports

`src/components/ExportButtons.tsx`, generated client-side from data already fetched/computed (no
extra server round-trip):
- **CSV**: one row per hour -- state, region, region type, local hour, baseline MW, each layer's
  MW, resulting MW, an explicit classification column, source, dataset, quality flags.
- **JSON scenario**: state, region, date range, profile type, methodology version, full baseline
  `LoadProfile`, assumptions + `DemandStackResults`, and a disclaimer. Neither ever includes the
  API key or any secret.

## Production deployment

`npm run build` produces `dist/` (static client) and `dist-server/` (compiled Express). Run
`node dist-server/server/index.js` (or `npm start`) with `EIA_API_KEY`/`ENERGY_DATA_ADAPTER` set
in the real environment (not `.env.local`, which is dev-only and git-ignored); put a static file
server / CDN in front of `dist/` and reverse-proxy `/api` to the Node process, or add
`express.static("dist")` to `server/index.ts` if you want one process to serve both. Swap
`FileCache` for a real store (see Caching above) before scaling beyond one instance, since the
file cache is per-instance.

## Live EIA verification (this session)

Both automated environments available during development -- this session's own cloud sandbox, and
the sandboxed shell used to control the user's linked computer -- route outbound traffic through a
proxy allowlist that does not include `api.eia.gov` (confirmed via direct diagnostics: DNS/CONNECT
fails for `api.eia.gov`, while `registry.npmjs.org` succeeds). `WebFetch`, a separate Anthropic-run
fetch path, *can* reach `api.eia.gov`, and was used to capture real, live, unmodified API responses
and to test query-parameter behavior directly against the real API. That work found and fixed three
real bugs that unit/demo-mode testing could not have caught, because they only manifest against the
live path:

1. **`.env.local` was never actually loaded.** No part of the app called `dotenv` or read `.env`
   files -- `server/env.ts` read `process.env` directly. So a key pasted into `.env.local`, exactly
   as the README's Quickstart instructs, was never read; `EIA_API_KEY` stayed empty and the app
   silently, "successfully" fell back to demonstration data with no error. **Fixed**: `server/env.ts`
   now loads `.env.local` (falling back to `.env`) via `dotenv` before `ENV` is computed, skipped
   under Vitest so tests stay hermetic. This was very likely the primary reason live data never
   flowed, independent of anything else below.
2. **The dev-entrypoint guard silently no-ops for any project path containing a space.**
   `server/index.ts` gated `app.listen(...)` behind `import.meta.url === \`file://${process.argv[1]}\``,
   but `import.meta.url` percent-encodes spaces (`%20`) while the raw `process.argv[1]` string does
   not -- so for a path like `.../Demand Stack Simulator/server/index.ts` (the user's real folder
   name), the comparison always fails, the server process starts, does nothing, and exits cleanly
   with no error or log line. **Fixed**: the guard now compares via `pathToFileURL(process.argv[1]).href`,
   which encodes the same way `import.meta.url` does.
3. **`fetchStateOverview` requested multiple `data` columns the wrong way.** EIA v2 silently
   returns only the *first* column when several are requested with repeated `data[]=` params (no
   error, no warning -- confirmed by live-testing `data[]=price&data[]=sales`, which returned price
   only, for every row). The indexed form (`data[0]=price&data[1]=sales&...`) is required to get all
   requested columns back. **Fixed**, and this exact bug now has a permanent regression test (see
   below) so it can't silently regress.

After fixing (1) and (2), the real production server was started on the user's actual machine with
their real `EIA_API_KEY`, and `/api/energy/source-status` confirmed the app now correctly resolves
`apiKeyConfigured: true`, `activeAdapter: "EIA"`, `fellBackToDemo: false` -- i.e. the app itself now
correctly attempts live EIA calls, which it did not before either fix. The final outbound request
from that run failed with `getaddrinfo EAI_AGAIN api.eia.gov`, which is the same proxy/DNS
allowlisting described above, on the sandboxed shell used to control the machine -- not a code
defect, and not present on the user's own network when they run `npm run dev` directly themselves
(outside of that remote-control shell).

Because no automated environment in this session could complete a real outbound call from *inside*
the running Express server, the exact production code that parses/normalizes a live response
(`EiaDataAdapter.fetchHourlyDemand`/`fetchStateOverview`, `fillLocalTimestamps`,
`checkHourlyQuality`) is instead exercised, unmodified, against real captured EIA payloads (fetched
live via `WebFetch`, including the multi-column bug above) in
`server/lib/adapters/eiaAdapter.test.ts` -- part of the standard `npm test` run, not a one-off
script. Recommended next step: run `npm run dev` on your own machine (normal, unrestricted network)
with your real key in `.env.local` and confirm `/api/energy/source-status` reports
`"status": "live"`; report back only if the live response shape differs from what's captured in
that test file.

## Other known limitations

- The balancing-authority-to-state mapping is curated, not sourced from EIA structured data (see
  above) -- correct it as needed via the "Adding a state mapping" steps.
- `net_generation`/`interchange` metrics are normalized but not surfaced in the UI yet.
- No Playwright/e2e test file is included in the repo yet (a manual headless-browser smoke pass
  was run during this build instead, covering state/region switching and stack toggling with zero
  console errors) -- worth adding as `tests/e2e/*.spec.ts` with `@playwright/test` for CI.
- The 3D "energy world" storytelling visualization from the original product brief is out of
  scope for this pass (see "Stack and why" above).
- Generation mix, DER/program-assumption data, and a LocalCsvAdapter are structurally supported
  but not implemented in this pass, per "don't ingest everything before slice 1 works."
- The utility-by-state mapping for rate schedules (`DEFAULT_UTILITY_BY_STATE`) covers only
  Virginia; other states return `utility_not_yet_mapped_for_state` rather than a guessed utility.
- URDB is crowd/vendor-maintained: coverage, `is_default` flagging, and update timeliness vary by
  utility. This app never covers that gap by fabricating a default or a rate value -- see
  "Live URDB verification" above for exactly how it's handled.

## Delivery notes (this session)

The prior project codebase referenced in earlier session memory (a Vite+React app with a 3D
energy world, `docs/DISCOVERY.md`, etc.) could not be found in the connected folder or elsewhere
on the linked machine when this work started; the user confirmed starting fresh in the connected
folder. This app was built end-to-end in this session: typecheck, lint, both production builds, and
a real headless-browser smoke run (state switching, region switching, Demand Stack toggling, chart
updates) all pass with zero console errors, in demo-adapter mode (the only mode reachable
end-to-end from an automated shell in this session -- see "Live EIA verification" above). The test
suite (`npm test`) covers 46 automated tests, including two that run the real, unmodified EIA
adapter code against genuine captured API responses.
