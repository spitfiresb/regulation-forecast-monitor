# Regulation Z Forecast Monitor

A single-rule regulatory forecast monitor for CFPB **RIN 3170-AB57**, “Contingency Calculations for Determining Average Prime Offer Rate.” Built with Next.js App Router, TypeScript, Tailwind, and Supabase Postgres. All application and ingestion code lives in this repository.

## Run locally

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. Requires Node 22 or newer. **No credentials are required to run the app.** It initially displays a committed, dated snapshot of real official sources. “Refresh official data” performs a live fetch and saves to `.data/latest.json` until Supabase is configured. Local data and environment files are ignored by Git.

## What is implemented

- Four answers: expected change, qualitative likelihood, timing, and linked evidence.
- A responsive known / forecast / unknown timeline, with no invented milestones.
- Per-conclusion “Why?” controls, filterable evidence, original wording, observation timestamps, source links, and methodology.
- `syncRule()`, `POST /api/sync`, and `GET /api/rule` in the same Next.js app.
- Current-agenda discovery for the exact RIN, avoiding a permanently pinned agenda edition.
- Federal Register exact-RIN search and structured document checks. Missing RIN metadata can cause a publication to be missed; the UI states this limitation.
- Stable content-derived signal IDs, transactional writes, retained history, duplicate protection, and stale-write rejection.
- Source failure notices with the previous record preserved. A failed search is never treated as evidence that no rule exists.
- Optional server-side Gemini summarization with validation and official-text fallback.

The initial verified record is in Proposed Rule Stage, with a **July 2026 NPRM agenda target**. Since that target has elapsed, the UI labels it accordingly. Final-rule timing and the effective date remain **Unknown**. A scheduled NPRM is never treated as a published proposal.

## Connect Supabase

1. Create a Supabase project.
2. Run [`supabase/migrations/202609210001_regulation_z.sql`](supabase/migrations/202609210001_regulation_z.sql) in the project's SQL Editor (or use your normal Supabase migration workflow).
3. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported.
4. Restart the app and refresh official data, or run `npm run sync`.

Use the **server secret** key, not a publishable/anon key. No database credential is sent to the browser. All four tables have row-level security enabled and no anonymous/authenticated policies. The server writes through a single transaction, `save_rule_snapshot(jsonb)`.

**No Edge Functions, Realtime, Storage bucket, or separate backend are needed.**

Tables:

| Table       | Purpose                                                           |
| ----------- | ----------------------------------------------------------------- |
| `rules`     | Latest official rule fields                                       |
| `signals`   | Deduplicated evidence with raw wording and first/last observation |
| `forecasts` | Latest deterministic forecast and per-conclusion evidence IDs     |
| `sync_runs` | Complete successful snapshots for consistent reads and history    |

History is preserved but not blindly fed into the current forecast. Each snapshot contains the currently applicable signals. A failed Federal Register check may carry forward earlier signals with their original timestamps and an explicit warning.

## Connect Google Gemini

Set `GEMINI_API_KEY` in `.env.local`. The configurable default is **`gemini-2.5-flash-lite`**, which Google's documentation lists with free-tier input/output. Quota and account eligibility are controlled by Google; this app makes no automatic model upgrades or paid fallback calls.

```sh
npm run gemini:check
npm run sync
```

Gemini only rewrites the official abstract into a brief expected-change summary. The request sends no customer data, database content, or credentials other than the API authentication header. Model output cannot populate stage, likelihood, dates, or publication evidence. Failure, quota exhaustion, or invalid output falls back to the exact official excerpt. A successful summary is reused while the source abstract remains identical.

**The real Gemini call remains untested until a key is supplied.** Mocked success, malformed/out-of-scope output, and rate-limit failure paths are tested.

## Forecast logic

| Strongest current evidence            | Label            |
| ------------------------------------- | ---------------- |
| Agenda only                           | Early            |
| Proposed Rule Stage                   | Developing       |
| NPRM published                        | Strong           |
| Published comment deadline has passed | High signal      |
| Final Rule Stage                      | Very high signal |
| Final rule published                  | Finalized        |

These are procedural labels, **not statistical probabilities**. Confidence is qualitative. Withdrawals, corrections, ambiguous additional publications, and unknown stages require manual review. Reopened comment windows take precedence over previously closed windows. The comment closing day is conservatively treated as open through that UTC calendar day because the API field contains no closing time.

Dates retain source precision: Reginfo's `07/00/2026` is stored as `2026-07` and displayed as July 2026, never July 1. An effective date is shown only when attached to its matching published final rule. Unknown final timing stays unknown.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run sync                  # live government sources, writes the configured store
npm run baseline:refresh      # explicit maintainer update to the committed snapshot
npm run test:db               # optional: requires local PostgreSQL binaries
```

Unit/integration tests cover the real Reginfo HTML parser, stage precedence, date precision, comment windows, source failure, persistence, stable IDs, request origin checks, and Gemini boundaries. The database check starts an isolated disposable PostgreSQL cluster over a Unix socket, applies the actual migration, exercises the server role, and checks RLS, idempotency, rollback, and stale-write protection. It never connects to an existing database. Set `PG_BIN` if PostgreSQL's binaries are not discoverable through `pg_config`.

GitHub Actions runs lint, tests, and the production build on pushes and pull requests. Live government ingestion is deliberately separate from deterministic CI tests.

## Deployment

Deploy this **native Next.js** app to a Node-compatible host such as Vercel. Configure Supabase for durable storage; the local JSON adapter is for development or a single Node process with a persistent filesystem. It is not shared storage for multiple instances. No live Supabase project or hosted deployment has been provisioned by this repository.

Set `APP_ORIGIN` to the exact deployed origin (for example, `https://your-monitor.example.com`, without a trailing slash). The browser's refresh request must match it. Optional automation can use `Authorization: Bearer <SYNC_SECRET>`. Refresh requests have a short cooldown, and simultaneous requests in one process are coalesced. The stored last-sync time also avoids redundant refreshes across instances after completion.

There is no application sign-in flow in this MVP. Keep the deployment behind the host's private-access control if it must stay private; GitHub repository privacy does not control website access. The origin check prevents cross-site browser writes, not requests by arbitrary API clients. If this becomes a public service, add authenticated refresh access and a distributed rate limiter.

## Official references

- [Current CFPB Unified Agenda](https://www.reginfo.gov/public/do/eAgendaMain?agencyCd=3170&currentPub=true&operation=OPERATION_GET_AGENCY_RULE_LIST&showStage=active)
- [Initial rule record](https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=3170-AB57&pubId=202510)
- [Federal Register RIN API lookup](https://www.federalregister.gov/api/v1/documents.json?conditions%5Bregulation_id_number%5D=3170-AB57&per_page=100&order=newest)
- [Gemini Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) · [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Supabase server API keys](https://supabase.com/docs/guides/getting-started/api-keys)

The source record also lists Regulation C / 12 CFR 1003. That cross-reference is retained faithfully in the evidence, while this product's focus and title are Regulation Z.
