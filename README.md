# Cascade

Fail any piece of a city's infrastructure and watch the consequences spread through power, water, roads and comms, hour by hour, for 72 hours. Then compare what you could do about it.

Cascade is a zero-install, browser-native cascade simulator that works from sparse open data. Every dependency carries its provenance, every failure has a time and a traceable cause, and a budgeted optimizer suggests where to intervene.

## How it differs from existing tools

Cross-sector simulators already exist, for example InfraRisk (an open-source power, water and road model) and CReDo (a flood digital twin built with asset owners). Cascade does not replace them. What it offers:

- **Runs in the browser** from open data (OpenStreetMap, open elevation tiles). No install, no database, no account.
- **Time to failure, not pass or fail.** Backup buffers (generators, batteries, tanks) delay failures, and the engine reports when each node goes down.
- **Provenance on every edge**: observed in OSM, inferred with a confidence, or set by the user.
- **Explainable.** Click any failed node to see the chain that took it down; optional plain-English narration of that chain.
- **Budgeted optimizer** over a small intervention catalogue, with up to three plans compared side by side.
- **Uncertainty** from Monte Carlo over the flood stage and over which supplier an inferred edge really points at.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Optional: set `GEMINI_API_KEY` (free tier) in `.env.local` for narrated explanations; without it a template is used.

```bash
npm run check        # typecheck, lint, unit tests, colour lint
npm run build:cities # rebuild public/data/*.json from OpenStreetMap and elevation tiles
npx tsx scripts/build-hero.ts      # satellite, building and texture assets for the landing page
npx tsx scripts/landing-facts.ts   # the simulated figures quoted on the landing page
```

## Layout

- `lib/engine/`: inference, simulation, Monte Carlo, fragility and optimizer (pure TypeScript, run in a Web Worker), with tests.
- `lib/assumptions.ts`: every default assumption, in one place.
- `app/`: landing page, `/dashboard`, `/method`, and two small API routes (`/api/hazard`, `/api/explain`).
- `scripts/`: data builders and checks.

## Data and limits

Data sources, every assumption with its default, the impact formula and the model's limits are on the `/method` page. Licences are in [CREDITS.md](CREDITS.md). In short: the flood is a bathtub model on height above the nearest drainage, most dependencies are inferred from geography, and all figures are simulated scenarios, not forecasts.
