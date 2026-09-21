# General regulatory monitor data model

The monitor separates the searchable government catalog from rulemakings it has actually checked. The existing APOR rule keeps its `apor-contingency` ID; other rulemakings use their lowercase RIN. A rulemaking can affect several CFR parts, so CFR references are an array, not a parent/child rule tree. Full eCFR section browsing is not part of this import.

## Records

| Table            | Purpose                                                                                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rule_catalog`   | Latest imported agenda entry for each RIN: agency, title, abstract, stage, CFR references, raw timetable, edition and source link. `is_current` indicates membership in the latest import, including its active, long-term and completed entries. Absence from a new edition never means withdrawal. |
| `catalog_import` | Last successful complete import: edition, source URL, fetch timestamp and entry count.                                                                                                                                                                                                               |
| `rules`          | Rulemakings actually checked by the monitor, with their latest complete snapshot. Catalog import does not create a forecast.                                                                                                                                                                         |
| `signals`        | Content-derived evidence IDs scoped to a rule. Original wording, source URL, source dates and observation times remain available.                                                                                                                                                                    |
| `forecasts`      | Latest procedural assessment per monitored rule. These labels are not calibrated adoption probabilities.                                                                                                                                                                                             |
| `sync_runs`      | Historical snapshots when substantive content or forecast outcomes changed. Despite its legacy name, it no longer logs every successful refresh.                                                                                                                                                     |

Catalog imports are atomic: incomplete/invalid imports leave the previous catalog intact. RINs absent from a later import are retained with `is_current=false`. Both catalog ingestion and monitored-rule writes reject stale updates. Catalog entries have no forecast or implied publication verification.

## Six-month retention

Keep all entries in the current agenda catalog, regardless of their original age. Retain historical monitor snapshots for the preceding **six calendar months**, based on observation time in UTC. Month-end subtraction clamps to the last valid day. This window is not a filter on rule publication dates.

A successful refresh always updates the current snapshot. A new historical version is created only when source content, evidence, forecast outcomes, or availability warnings change. Observation timestamps, comparison prose and timestamp-bearing reasoning alone do not create versions. Federal Register check IDs remain stable across unchanged daily checks.

The current snapshot is stored separately and survives indefinitely, even when unchanged for over six months. Old source evidence necessary to interpret current state also survives. Expired historical snapshots and old unreferenced signals can be removed. History is observation-based; a current catalog import does **not** backfill six months of past forecasts.

Per-rule writes prune that rule's expired snapshots. `npm run catalog:import` also performs global cleanup. On Supabase, the third migration schedules daily cleanup at 03:30 UTC through `pg_cron`, including inactive rules and unused evidence. On a standalone PostgreSQL installation without `pg_cron`, schedule `npm run history:prune` daily on the host. Reads exclude expired history even between cleanup runs.

## Setup and operations

Apply these migrations in order (existing installations apply migrations after the first):

1. `supabase/migrations/202609210001_regulation_z.sql`
2. `supabase/migrations/202609210002_general_rule_catalog.sql`
3. `supabase/migrations/202609210003_history_retention_schedule.sql`
4. `supabase/migrations/202609210004_catalog_safe_update.sql`

Then set the server-only Supabase environment variables described in `.env.example` and run:

```sh
npm run catalog:import
npm run sync                    # existing APOR rule
npm run sync -- 3170-AB57       # an exact RIN from the imported catalog
npm run history:prune
```

The importer discovers the newest XML download from Reginfo's catalog page; no edition is pinned. Source edition and import timestamp are separate because fetching a semiannual agenda today does not make its planned dates current. A monitored refresh still checks the Federal Register independently and conservatively retains prior evidence on failures. Agenda HTML discovery currently uses the active-agenda index: completed/long-term entries remain searchable but may require manual source review when a live refresh cannot find them. No bulk refresh of all catalog entries or AI summarization is triggered by an import.

Without Supabase, data goes to ignored `.data/catalog.json` and `.data/rules/<id>.json`. Each per-rule file contains `latest` and `history`. The original `.data/latest.json` remains readable for the APOR rule; the next write adopts it into the per-rule store. The local adapter supports a single process, not multiple host instances. No secrets or downloaded catalog are committed.

## Interface for the next UI iteration

- `GET /api/rules?q=water&agency=2040&limit=25&offset=0`: catalog search with source metadata, total count and pagination. Agency is the Reginfo agency code; omit it to search all agencies. Search matches a case-insensitive literal substring across title, RIN, agency, CFR citations and abstract. A missing catalog returns no entries and null import metadata.
- `GET /api/rule?id=apor-contingency`: latest monitored snapshot; the existing default remains compatible. An unmonitored non-default rule returns 404, not the APOR fallback.
- `getHistory(ruleId)`: six-month change history, newest first.
- `syncRule({id, rin, agency_code})`: refresh one rule with independent concurrency coalescing.

The dashboard and its selection controls can be designed around these records separately. Public refresh controls still target the original rule until the selection UI and its authorization/rate-limit behavior are designed.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:db`. The database check upgrades an already-populated disposable PostgreSQL database and checks independent rules, unchanged-refresh deduplication, retention, catalog rollback, RLS and stale/cross-rule rejection. It does not modify the hosted database.

## Search and forecast integration

Migration `202609210005_prediction_ledger.sql` adds ranked Postgres catalog search and an immutable `prediction_issues` ledger, plus append-only `prediction_resolutions`. Migration `202609210006_search_relevance.sql` fixes short-term relevance (for example, APOR must not be ranked behind incidental matches in “vapor”). Both were applied to the Kobalt Interview project after disposable-database testing of the ledger.

The six-month operational rule history is unchanged. The separate forecast ledger retains compact issues for 12 months, and never prunes until at least 30 days after the window ends. Each issue includes its exact evidence and evaluation report so pruning operational snapshots cannot destroy its basis. Daily ledger cleanup is scheduled separately. This is the evaluation retention exception described in the approved next-stage plan.

- `GET /api/rules?q=...&limit=8&offset=0`: ranked catalog results with previously checked IDs.
- `GET /api/rules/[rin]`: catalog entry, saved source snapshot, latest immutable forecast assessment, and current evaluation.
- `POST /api/rules/[rin]/refresh`: check this selected rule and record its forecast assessment. Each rule has independent coalescing/cooldown. Origin authorization remains required.
- `GET /api/forecasts/[id]/evidence`: the exact saved issue, evidence, and original evaluation report.
- `GET /api/evaluations/[version]`: the current public report; older reports remain embedded in their forecast issues.

`forecasts` still stores the legacy procedural assessment for compatibility. Statistical publication forecasts live in `prediction_issues` and use `probability`, never the legacy stage codes as percentages. A null probability has an explicit reason. No percentage is enabled by the current preliminary evaluation. See [forecast evaluation](forecast-evaluation.md).

### Guided browsing

`GET /api/rules` also accepts `category` (an ID from `lib/browse.ts`). Categories are curated issuing-agency groups, can overlap, and are not official subject classifications or customer applicability decisions. Filtering happens in Postgres before counting and pagination through `browse_rule_catalog`; an empty category includes the complete current catalog. Migration `202609210007_catalog_browse.sql` adds that service-role-only function.

The single-page entry screen provides a category selector, example topic searches, and a full-list option. Result cards link directly to the official agenda entry and show the agenda edition and a listed timetable date, preserving month-only precision. These dates do not establish publication or effectiveness. Existing forecast and source-refresh behavior is unchanged.
