# Regulatory Forecast Monitor

An early MVP for exploring recent regulatory changes and experimental AI forecasts of future Federal Register publications. Built with Next.js, TypeScript, Gemini, and Supabase, deployed on Cloudflare Workers through OpenNext.

## Product

Browse publications from the past six calendar months using agency and publication-type filters. Selecting a publication retrieves its linked history, including older context. Source status and dates remain separate from blue AI-generated text.

The research agent chooses official-text reads, historical searches, and comparison traces within three rounds and six source actions. It proposes a future publication event in a 90, 180, or 365 day window, with cited reasoning, a counterargument, and signals to watch. Validation and a separate model review check the result. A rejected draft may be revised once against the same evidence and reviewed again. Incomplete research or unsupported reasoning can withhold a forecast. Predictions have no validated accuracy or calibrated probabilities.

The **View some nice examples** menu contains publication links only. Each click retrieves sources and runs fresh AI research, bypassing the assessment cache. No bundled forecast responses or saved-success fallback are served. Live results can differ or abstain. See [live examples](docs/curated-examples.md).

Floating navigation opens Home, How it Works, and the MVP's purpose. The system architecture and data model are available from How it Works. This is a research prototype, not a finished compliance product or a customer-document applicability engine.

## Local setup

Use only `/Users/zainsaeed/Desktop/regulation-z-forecast-monitor`, with the app at `http://127.0.0.1:3000`. Do not start another checkout or app port.

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Requires Node 22 or newer. Preserve existing credentials when configuring an established checkout. Set `GEMINI_API_KEY` for live research. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` with no automatic model upgrade or alternate-model fallback.

For Supabase, apply unapplied migrations in filename order and set `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). These credentials stay on the server. Local development can save under `.data/activity` and `.data/activity-assessments` when Supabase is unconfigured. Hosted deployments require durable Supabase storage.

## Storage and scope

The active app uses `activity_records` for latest cases and `activity_assessments` for immutable assessments, saved transactionally through `save_activity_case(jsonb)`. Records include official passages, source actions, comparisons, validation findings, model reviews, and forecast provenance. Current versions are `research-event-agent-v4` and `research-event-forecast-v7`.

Normal selections may reuse a successful assessment for up to one hour on the same UTC day. Refresh and example links rerun research. The six-month browsing window is separate from the forecast horizon and storage retention.

The retired agenda monitor, its routes, scripts, UI, and evaluation artifacts have been removed from the application. They remain in Git history. All nine SQL migrations and the eight historical tables are preserved; this code cleanup does not delete hosted records or alter retention jobs installed by earlier migrations.

See [research scope](docs/recent-activity-scope.md), [data model](docs/data-model.md), and the in-app `/architecture` and `/architecture/data-model` pages.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

The database check uses a disposable PostgreSQL cluster over a Unix socket, applies the full migration chain, and checks activity persistence, RLS, immutability, rollback, deduplication, and stale-write rejection. It never connects to hosted Supabase. Set `PG_BIN` if local PostgreSQL binaries are not discoverable through `pg_config`.

For opt-in live checks, run `npx tsx scripts/check-examples.ts`. Pass the production origin to check the deployed API, and an additional `1` for one pass. These checks call real sources and Gemini, space requests to reduce throttling, and report abstentions and failures without replaying earlier successes. CI runs lint, deterministic tests, and the production build.

## Deployment

[GitHub main](https://github.com/spitfiresb/regulation-forecast-monitor) is the source for [kobaltinterview.party](https://kobaltinterview.party). Commit and push the exact source, ensure the checkout is clean, then run:

```sh
npm run deploy:cloudflare
```

GitHub pushes alone do not deploy. Cloudflare secrets supply runtime credentials; the build strips local credential defaults from Worker artifacts. The public demo has per-IP API request limits and no sign-in. See [deployment and verification](docs/cloudflare-deployment.md).
