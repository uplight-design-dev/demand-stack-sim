# Demand Stack Simulator

An educational, self-service web experience that shows utility professionals what a region's
electricity demand looks like, using real public grid data from the U.S. Energy Information
Administration (EIA), and lets them build a Demand Stack (Energy Efficiency, Rates & Behavior,
Demand Response) against that baseline.

This is not a forecasting, planning, or engineering tool, and its output is not suitable for
regulatory filings -- see the in-app methodology panel and disclaimer.

## Quickstart

```bash
npm install
cp .env.example .env.local   # then paste your EIA and OpenEI API keys into .env.local
npm run dev                  # starts the Vite client (5173) + Express API (8787)
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the Express server (see
`vite.config.ts`), so the browser only ever talks to this app's own API -- never to
`api.eia.gov` or `api.openei.org` directly, and neither API key ever reaches the client.

No EIA key yet, or EIA temporarily down? The app falls back to a clearly labeled demonstration
dataset automatically -- nothing breaks. Set `ENERGY_DATA_ADAPTER=demo` in `.env.local` to force
demo mode. Rate schedules (the Rate Explorer) work the same way with `OPENEI_API_KEY`: no key, or
the OpenEI API unreachable, falls back to a frozen real-data snapshot (see docs/ARCHITECTURE.md
"Rate schedule data source").

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Client (Vite) + API (Express, via `tsx watch`) together |
| `npm run typecheck` | TypeScript, client and server projects |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit + integration tests |
| `npm run build` | Production client bundle (`dist/`) + compiled server (`dist-server/`) |
| `npm start` | Runs the compiled production server (serve `dist/` behind it yourself, or add static-serving -- see docs/ARCHITECTURE.md "Production deployment") |

## Deploying to Vercel

The Express API is wrapped as a single Vercel serverless function (`api/index.ts`) rather than
run as a long-lived server -- see `vercel.json` for the build/output/rewrite config that makes
`/api/*` reach it while everything else is served as the static `dist/` build.

After importing the repo into Vercel, set these in the project's **Settings -> Environment
Variables** (nothing is committed -- `.env.local` is git-ignored):

| Variable | Required for |
|---|---|
| `EIA_API_KEY` | Live hourly grid data (falls back to demo data if unset) |
| `OPENEI_API_KEY` | Live utility rate schedules (falls back to a frozen snapshot if unset) |

No other variables are required -- `CACHE_DIR` automatically points at `/tmp` in Vercel's
environment (`server/env.ts`), since only `/tmp` is writable there, and it's per-instance rather
than durable (fine for its job of avoiding redundant upstream calls within one warm function
instance; see `server/lib/cache.ts` for swapping in a real datastore later).

## Documentation

See `docs/ARCHITECTURE.md` for the full architecture, EIA routes/facets used, the state-to-BA
geographic mapping and how to extend it, caching, data-quality rules, timezone/DST handling,
representative-day methodology, Demand Stack formulas, export formats, and known limitations.

## Security

`EIA_API_KEY` and `OPENEI_API_KEY` are each read once, server-side, in `server/env.ts`, and passed
only into their respective adapter (`EiaDataAdapter` / `UrdbDataAdapter`). Neither is ever sent to
the client, logged, cached, or included in an export.
`.env.local` is git-ignored (see `.gitignore`); only `.env.example` (no real values) is committed.
