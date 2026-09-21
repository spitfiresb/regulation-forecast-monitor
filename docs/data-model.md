# Regulatory monitor data model

The active application investigates recent Federal Register publications and forecasts future publication events. The retired agenda monitor's application code and API routes have been removed. Its database objects remain in the preserved migration chain.

## Active records

| Table                  | Purpose                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `activity_records`     | Latest case keyed by selected Federal Register document number. Includes publication date, check time, and the complete JSONB payload. |
| `activity_assessments` | Immutable assessment payloads keyed by content fingerprint, linked to the selected publication.                                        |

`save_activity_case(jsonb)` writes both records in one transaction, rejects stale writes, and deduplicates identical fingerprints. Row-level security restricts access to the server; the service role cannot update or delete archived assessments. Browser clients receive only the application API response.

A case contains the selected publication, linked history, excluded-match count, linkage and completeness findings, official excerpt, assessment, check time, and browsing window. AI provenance includes model and prompt versions, input hash, research actions, inspected passages, comparisons, cited reasoning, target event, forecast window, and review. When revision occurs, `ai.review_attempts` preserves drafts, validation errors, and model reviews. These are JSONB fields, not separate tables.

Source metadata remains unchanged. An unambiguous explicit new date in a delay notice's DATES text may supersede conflicting structured metadata in the assessment, with `effective_date_note` disclosing the discrepancy. Ambiguous or invalid new dates remain unresolved.

## Windows, cache, and retention

The browsing window covers six calendar months of publication dates. Supporting history may be older. Forecast horizons are independently selected as 90, 180, or 365 days.

Ordinary selections can reuse a successful current-version assessment for up to one hour on the same UTC day. Example links and refresh bypass this cache. Unavailable or reviewed-withheld results are not reused as successful research. There are no bundled example-response files or fallback to an old successful forecast.

Active cases and assessments have no scheduled retention cleanup in the current migrations. A new issue time can create a new immutable assessment. Local development uses `.data/activity` and `.data/activity-assessments` when Supabase is unconfigured. Hosted deployments set `REQUIRE_HOSTED_STORAGE=true`.

## Preserved historical schema

Eight tables belong to the retired monitor: `rule_catalog`, `catalog_import`, `rules`, `signals`, `forecasts`, `sync_runs`, `prediction_issues`, and `prediction_resolutions`. Their functions, data, and migration-installed retention schedules are preserved. Current application code does not read or write these tables. The retired implementation is available in Git history.

Apply only unapplied migrations, in filename order:

| Suffix after `20260921`                   | Migration                                                        |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `0001_regulation_z.sql`                   | Original monitored rules, evidence, forecasts, and snapshots.    |
| `0002_general_rule_catalog.sql`           | General catalog, current snapshots, and change-only history.     |
| `0003_history_retention_schedule.sql`     | Scheduled agenda-history retention when cron is available.       |
| `0004_catalog_safe_update.sql`            | Catalog updates compatible with safe-update checks.              |
| `0005_prediction_ledger.sql`              | Immutable forecast ledger and ranked catalog search.             |
| `0006_search_relevance.sql`               | Search relevance fixes.                                          |
| `0007_catalog_browse.sql`                 | Agency-category filtering in catalog search.                     |
| `0008_recent_activity.sql`                | Current activity records, assessments, and transactional saves.  |
| `0009_remove_redundant_history_index.sql` | Recovered cleanup: removes the duplicate per-rule history index. |

Migration 009 preserves the recovered redundant-index cleanup without colliding with migration 005, the prediction ledger. Do not renumber or remove earlier migrations. This application cleanup adds no migration and deletes no hosted data.

## Active API

| Interface                                      | Purpose                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/activity?agency=...&type=...&page=1` | Browse recent publications with agency and publication-type filters.                                                  |
| `GET /api/activity/agencies`                   | Agency options for the native dropdown.                                                                               |
| `POST /api/activity/[document]/assess`         | Retrieve linked history, research a forecast, and save the assessment. `?refresh=true` bypasses the assessment cache. |

Assessment writes require the configured same-origin request or a server bearer token. Cloudflare adds request limits. Retired `/api/rule`, `/api/rules`, `/api/sync`, `/api/forecasts`, and `/api/evaluations` routes are no longer served.

## Verification

`npm run test:db` applies all migrations to a disposable local PostgreSQL cluster and verifies active transaction behavior, RLS, immutable assessments, deduplication, rollback, and stale-write rejection. It does not connect to hosted Supabase. See [research scope](recent-activity-scope.md) and [deployment](cloudflare-deployment.md).
