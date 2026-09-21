# Regulatory monitor data model

The current homepage searches recent Federal Register publications and assesses the next status change from their linked history. The agenda catalog and earlier forecast experiment remain available through retained APIs. They have different records and retention rules; none is an unused database solely because it is absent from the homepage.

## Records

| Table | Purpose |
| --- | --- |
| `activity_records` | Latest retrieved case, keyed by selected Federal Register document number. |
| `activity_assessments` | Immutable copies of linked history and next-status assessments, keyed by a content fingerprint. |
| `rule_catalog` | Latest imported agenda entry per RIN, including agency, abstract, stage, CFR references, timetable, and edition. `is_current` indicates membership in the latest import. |
| `catalog_import` | Metadata for the last complete import: edition, source URL, observation time, and entry count. |
| `rules` | Latest complete snapshot for each monitored agenda rule. APOR retains `apor-contingency`; other rule IDs are lowercase RINs. |
| `signals` | Deduplicated source evidence with original wording, dates, source links, and observation timestamps. |
| `forecasts` | Latest legacy procedural assessment; stage labels are not adoption probabilities. |
| `sync_runs` | Changed legacy snapshots from the past six calendar months, not every successful check. |
| `prediction_issues` | Immutable evidence and results from the retained publication-forecast experiment. |
| `prediction_resolutions` | Append-only observed outcomes for those issues. |

All ten tables have row-level security and server-only access. `save_activity_case(jsonb)` writes the latest case and assessment together and rejects stale writes. `save_rule_snapshot(jsonb)` transactionally writes legacy rule records and evidence. See [the current activity method](recent-activity-scope.md) and [the earlier forecast evaluation](forecast-evaluation.md).

## Catalog import and identity

Catalog imports are validated before saving; failed downloads or invalid data leave the previous catalog intact. Supabase imports use one transaction through `save_rule_catalog(jsonb)`. Entries absent from a later edition remain with `is_current=false`; absence does not mean withdrawal. Search includes only current entries. The local adapter atomically replaces `catalog.json` and does not retain absent entries. Both adapters reject stale imports.

Catalog import does not check publications, create forecasts, or backfill historical observations. No foreign key requires a monitored rule to appear in the current catalog. CFR parts are references, not child rulemakings. Full eCFR section browsing is outside this import.

The importer discovers the newest Reginfo XML edition. Edition dates and retrieval timestamps remain separate. Legacy rule refresh first checks the active-agenda index, then falls back to the imported edition for completed or long-term entries; it separately checks Federal Register publications.

## Time windows and retention

- **Current search:** publications from the past six calendar months. Linked history may be older. This is a search filter, not a forecast deadline or a database-retention policy.
- **Activity storage:** latest cases and immutable assessments have no scheduled retention cleanup in the current migration. The service role cannot update or delete archived assessments. Fingerprints exclude retrieval time so unchanged evidence does not produce duplicate assessments.
- **Agenda history:** retain changed snapshots for six calendar months by observation time, with month-end clamping. Latest rule snapshots and evidence referenced by current or retained history survive independently. Source content, forecast fields (including summary text and method), and warnings can create versions; retrieval timestamps and comparison prose do not. The dashboard's official-source comparison separately excludes generated summary changes.
- **Forecast experiment:** retain issues for 12 months and at least 30 days after their forecast window ends. Evidence and the evaluation report are embedded in each issue, independently of operational history.

Legacy rule writes prune that rule's expired history. `npm run catalog:import` also runs global history cleanup. Migration 003 schedules it at 03:30 UTC when `pg_cron` is available; migration 005 separately schedules prediction cleanup at 03:45 UTC. Without `pg_cron`, schedule the relevant cleanup externally. `npm run history:prune` handles agenda history, not activity assessments or prediction-ledger retention. History reads exclude expired versions between cleanup runs.

## Migrations and operations

Apply unapplied migrations in filename order:

| Suffix after `20260921` | Migration |
| --- | --- |
| `0001_regulation_z.sql` | Original monitored rules, evidence, forecasts, and snapshots. |
| `0002_general_rule_catalog.sql` | General catalog, current snapshots, and change-only history. |
| `0003_history_retention_schedule.sql` | Scheduled agenda-history retention when cron is available. |
| `0004_catalog_safe_update.sql` | Catalog updates compatible with safe-update checks. |
| `0005_prediction_ledger.sql` | Immutable forecast ledger and ranked catalog search. |
| `0006_search_relevance.sql` | Search relevance fixes. |
| `0007_catalog_browse.sql` | Agency-category filtering in catalog search. |
| `0008_recent_activity.sql` | Current activity records, assessments, and transactional saves. |
| `0009_remove_redundant_history_index.sql` | Recovered cleanup: removes the duplicate per-rule history index. |

The obsolete Desktop checkout called the index cleanup `202609210005_remove_redundant_history_index.sql`. That version collides with the canonical prediction-ledger migration, so the recovered file is **009**. Its `DROP INDEX IF EXISTS` is safe if the old cleanup already removed the index. Do not replace or skip the prediction-ledger migration based on the obsolete checkout's numbering. Inspect migration history before applying anything to an existing database.

The unique `(rule_id, synced_at)` index still supports newest-first history reads. The timestamp-only index remains for global pruning. Recovery did not execute hosted migrations or delete hosted data.

```sh
npm run catalog:import           # import the latest agenda; does not bulk-refresh rules
npm run sync                     # refresh the legacy APOR monitor
npm run sync -- 3170-AB57         # refresh an exact RIN from the imported catalog
npm run history:prune            # prune expired legacy history
```

Configure server credentials as described in [`.env.example`](../.env.example). Without Supabase, local files under `.data` store the catalog, per-rule latest/history, activity cases, activity assessments, and forecast issues. The original `.data/latest.json` remains readable for APOR. Local storage is for a single persistent process; hosted deployments requiring durable storage set `REQUIRE_HOSTED_STORAGE=true`.

## Current and retained interfaces

| Interface | Purpose |
| --- | --- |
| `GET /api/activity?q=...&page=1` | Current homepage search over recent published activity. |
| `POST /api/activity/[document]/assess` | Retrieve linked history and save a next-status assessment; `?refresh=true` forces a new check. |
| `GET /api/rules?q=...&category=...&agency=...&limit=25&offset=0` | Retained ranked catalog search, current import metadata, and previously checked IDs. Category IDs come from `lib/browse.ts`; these are curated agency groups, not official subject classifications. |
| `GET /api/rules/[rin]` | Retained catalog entry, saved snapshot, and earlier publication-forecast assessment. |
| `POST /api/rules/[rin]/refresh` | Refresh a selected agenda rule and its earlier forecast assessment. |
| `GET /api/rule?id=apor-contingency` | Legacy saved monitor snapshot. Unmonitored non-default IDs return 404. |
| `POST /api/sync` | Legacy APOR refresh only, with a 30-second cooldown. |
| `GET /api/forecasts/[id]/evidence` | Immutable issue, source evidence, and original evaluation report. |
| `GET /api/evaluations/[version]` | Public evaluation report for the earlier experiment. |

Write routes require same-origin or bearer-token authorization. The deployed Worker adds its own request limits; see [deployment](cloudflare-deployment.md). `getHistory(ruleId)` and `syncRule(target)` are server functions, not extra HTTP endpoints.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:db`. The database test upgrades a populated, disposable PostgreSQL cluster through all migration files and checks catalog search, immutable ledgers, activity transactions, retention, RLS, rollback, stale writes, and the remaining history index. It does not connect to the hosted database.
