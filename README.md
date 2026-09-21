# Regulatory Forecast Monitor

A searchable regulatory forecast monitor, initially built around CFPB **RIN 3170-AB57**, “Contingency Calculations for Determining Average Prime Offer Rate.” Built with Next.js App Router, TypeScript, Tailwind, and Supabase Postgres. All application and ingestion code lives in this repository.

## Current product: recent activity and next-status assessments

One search over Federal Register activity published in the **past six calendar months**. Select an update to retrieve its related history, including older publications, reconstruct its status, and generate an evidence-linked assessment of the next status change. Six months is the search radius, not a prediction deadline.

Search by keyword or RIN, or browse using agency and publication dropdowns. **How it works** opens `/how-it-works`, a separate explanation of the AI forecast pipeline with links to architecture and data-model views.

The current flow uses `/api/activity` and `/api/activity/[document]/assess`, with server-only Supabase storage for retrieved cases and immutable assessments. Source publication dates, action descriptions, and effective dates are separate from the generated forecast. Repeated effective-date delays are no longer labeled as repeated original final rules.

Gemini generates evidence-linked next-status scenarios after deterministic checks establish the current status and forecast eligibility. Outputs are validated and stored with model, prompt version, input hash, and citations. AI failures use an explicitly labeled rules-based fallback. Forecasts are experimental, not calibrated probabilities. Ambiguous relationships or incomplete history cause abstention. See [current scope and implementation](docs/recent-activity-scope.md) for coverage, linking, status rules, limitations, and storage. The previous agenda-catalog UI and six-month-forward probability experiment are legacy code and are not the homepage's product flow.

## Run locally

**Only local checkout:** `/Users/zainsaeed/Desktop/regulation-z-forecast-monitor`, served at **http://127.0.0.1:3000**. [GitHub main](https://github.com/spitfiresb/regulation-z-forecast-monitor) is the shared source; [kobaltinterview.party](https://kobaltinterview.party) runs its deployed build. Earlier duplicate checkouts were consolidated. See [the recovery audit](docs/cleanup-audit.md).


```sh
cd /Users/zainsaeed/Desktop/regulation-z-forecast-monitor
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The dev/start scripts explicitly use port 3000 and fail if it is occupied instead of silently opening a second port. Requires Node 22 or newer. Activity search reads the public Federal Register API directly. Configure Supabase for hosted case storage; without it, selected cases save under `.data/activity`. The committed APOR baseline and agenda import remain available only to the legacy monitor APIs. Local data and environment files are ignored by Git.

## Legacy monitor capabilities (retained APIs)

- Plain-English agenda summary, observed rulemaking progress, timing, and linked evidence. Adoption likelihood is explicitly unassessed.
- Elapsed-target detection, explicit agency-date provenance, and directional outlooks even without a scheduled NPRM. No customer-specific applicability claims.
- One search, one record, working source refresh, and inline evidence. Architecture documentation remains at `/architecture` and `/architecture/data-model`.
- Inline “Why?” dropdowns with original wording, observation timestamps, and source links beside each conclusion.
- `syncRule()`, `POST /api/sync`, and `GET /api/rule` in the same Next.js app.
- Current-agenda discovery for the exact RIN, avoiding a permanently pinned agenda edition.
- Federal Register exact-RIN search and structured document checks. Missing RIN metadata can cause a publication to be missed; the UI states this limitation.
- Stable content-derived signal IDs, transactional writes, retained history, duplicate protection, and stale-write rejection.
- Source failure notices with the previous record preserved. A failed search is never treated as evidence that no rule exists.
- Optional server-side Gemini summarization with validation and official-text fallback.

The initial verified record is in Proposed Rule Stage, with a **July 2026 NPRM agenda target**. Since that target has elapsed, the UI labels it accordingly. Final-rule timing and the effective date remain **Unknown**. A scheduled NPRM is never treated as a published proposal.

## Connect Supabase

1. Create a Supabase project.
2. Apply files in `supabase/migrations` in filename order, applying only migrations not already recorded. See [the data model](docs/data-model.md) for the full sequence and the recovered index-cleanup migration.
3. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported.
4. Restart the app and select a recent activity result to save its case and assessment. `npm run sync` refreshes the legacy APOR monitor.

Use the **server secret** key, not a publishable/anon key. No database credential is sent to the browser. All ten application tables use row-level security with server-only access. The current activity flow saves its latest case and immutable assessment through `save_activity_case(jsonb)`; the retained agenda monitor uses `save_rule_snapshot(jsonb)`.

| Storage | Purpose |
| --- | --- |
| `activity_records`, `activity_assessments` | Current product: latest retrieved cases and immutable evidence-backed assessments. |
| `rule_catalog`, `catalog_import` | Imported Unified Agenda entries and import metadata, retained for catalog APIs. |
| `rules`, `signals`, `forecasts`, `sync_runs` | Legacy monitored rules, source evidence, latest assessments, and six-month change history. |
| `prediction_issues`, `prediction_resolutions` | Retained forecast experiment and observed outcomes; not the homepage's prediction method. |

No Edge Functions, Realtime, or Storage bucket is required. See [storage, retention, and API details](docs/data-model.md).

## Connect Google Gemini

Set `GEMINI_API_KEY` in `.env.local` and as a Cloudflare secret for production. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`; there is no automatic model upgrade or paid-model fallback.

The current activity flow sends public linked publication metadata, actions, abstracts, dates, checked status, and the assessment date to Gemini. The model returns a proposed next status, concise forecast, cited reasons, and alternatives. It cannot overwrite current status or published dates, or override source-check abstention. Validation requires the expected JSON shape, known citation IDs, and a latest-publication citation, and rejects numerical/date claims in generated prose. Citation checks do not verify every inference. Failed requests or invalid output retain the labeled deterministic assessment.

Successful AI output saves its model, prompt version, input hash, and reason-level citations in the existing case JSON; no database migration is required. The homepage detail discloses the actual method. The older `npm run gemini:check` command still checks the separate legacy abstract summarizer.

A live Gemini forecast for DOE document `2026-13305`, using six linked publications, was verified through the current activity endpoint on September 21, 2026. Mocked tests cover valid output, invented citations, missing latest evidence, numerical claims, extra fields, incomplete responses, rate limits, and abstention. Forecast accuracy has not been measured.

## Forecast logic

| Current evidence                      | Displayed progress                |
| ------------------------------------- | --------------------------------- |
| Agenda only                           | Listed in the agenda              |
| Proposed Rule Stage                   | Proposal planned in the agenda    |
| NPRM published                        | Proposal published                |
| Published comment deadline has passed | Published comment deadline passed |
| Final Rule Stage                      | Final rule planned in the agenda  |
| Final rule published                  | Final rule published              |

These describe observed procedure, not likelihood of adoption. The legacy database/API stage codes remain for compatibility, and the confidence field is always `Unassessed` in the current interpretation. No confidence rating is shown. Withdrawals, corrections, ambiguous additional publications, and unknown stages require manual review. Reopened comment windows take precedence over previously closed windows. The comment closing day is conservatively treated as open through that UTC calendar day because the API field contains no closing time.

Each new snapshot stores a comparison with the previous saved check inside its JSON record, requiring no database migration. Comparisons cover agenda title, abstract, stage, CFR parts, legal deadline, edition, NPRM target, and publication evidence. Timestamps and generated summaries are excluded. Failed Federal Register checks make the comparison incomplete; missing publications are never described as withdrawals. Old snapshots without comparisons show an explicit empty state until refreshed.

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

Deploy to Cloudflare Workers with OpenNext using `npm run deploy:cloudflare`. The domain is **https://kobaltinterview.party**. Supabase provides durable storage, and server credentials are configured as Cloudflare secrets. The build strips local environment defaults from Worker artifacts.

The public demo has API request limits (60 reads and 10 writes per minute per IP per Cloudflare location), with no sign-in. Forecasts remain experimental. See [deployment, secrets, preview, and verification instructions](docs/cloudflare-deployment.md).

## Official references

- [Current CFPB Unified Agenda](https://www.reginfo.gov/public/do/eAgendaMain?agencyCd=3170&currentPub=true&operation=OPERATION_GET_AGENCY_RULE_LIST&showStage=active)
- [Initial rule record](https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=3170-AB57&pubId=202510)
- [Federal Register RIN API lookup](https://www.federalregister.gov/api/v1/documents.json?conditions%5Bregulation_id_number%5D=3170-AB57&per_page=100&order=newest)
- [Google model documentation](https://ai.google.dev/gemini-api/docs/models) · [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Supabase server API keys](https://supabase.com/docs/guides/getting-started/api-keys)

The source record also lists Regulation C / 12 CFR 1003. That cross-reference is retained faithfully in the evidence, as part of the retained APOR baseline. The current homepage covers recent regulatory activity across agencies.
