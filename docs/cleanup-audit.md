# Checkout recovery and cleanup audit — September 21, 2026

## Canonical project

The single local checkout is now `/Users/zainsaeed/Desktop/regulation-z-forecast-monitor`, served on port 3000. Shared source is [GitHub main](https://github.com/spitfiresb/regulation-z-forecast-monitor); production is [kobaltinterview.party](https://kobaltinterview.party).

During recovery, the corrected app initially lived in the home-folder checkout. The previous Desktop copy stopped at `f357aae`; the corrected project includes the activity-based product in `95b1918` and deployment setup in `7ead44e`. The user then requested consolidation into Desktop. The corrected checkout, including its Git history, local data, and ignored environment files, was moved there. The old port 3001 server was stopped, and dev/start scripts now explicitly bind port 3000.

Temporary source backups and the obsolete checkout are removed after the corrected source is pushed and the production deployment is verified. Historical versions remain recoverable through GitHub's Git history, rather than separate working folders. No hosted records are deleted by consolidation.

## Reconciliation

| Work found in the obsolete checkout | Disposition in the canonical project |
| --- | --- |
| General rule catalog, per-rule snapshots, history, import/prune scripts, migrations 002–004, catalog tests, and architecture components | Already included in the current product commit. Preserved current implementations, including newer search, category, history-linking, and forecast behavior. |
| “How the system works” button and flowchart | Added to `ActivityMonitor`, which is the actual homepage. Copy describes Federal Register activity, linked history, fixed next-status rules, and source evidence. The old APOR/Reginfo/AI wording does not describe the current flow. |
| Unused hard-coded agenda/API constants and exports | Removed only unused declarations/exports. Kept the `signalSchema` export because `lib/prediction/model.ts` uses it. Kept current summary metadata and cache checks. |
| Unused `server-only` direct dependency | Removed from package manifest and lockfile, preserving the deployment dependencies and scripts. |
| TypeScript unused-local/parameter checks | Enabled while preserving deployment output exclusions. Next.js-generated `next-env.d.ts` is now ignored instead of tracked, as the installed Next.js guide requires. |
| Automatic migration discovery and history-index verification | Merged into the current disposable-database test without dropping prediction, search, or activity assertions. |
| `202609210005_remove_redundant_history_index.sql` | Recovered as `202609210009_remove_redundant_history_index.sql`, because 005 already belongs to the prediction ledger. It is idempotent if the old index cleanup has already run. No hosted migration was executed during recovery. |
| README and data-model documentation improvements | Reconciled against current source, preserving deployment documentation and correcting stale APOR-only, four/six-table, literal-search, and no-selection-UI claims. |
| Expanded database diagram | Updated to show all ten tables, including current activity storage and the retained forecast ledger. System diagram now follows the current activity flow. |
| Older `catalog`, `sync`, `reginfo`, `federal-register`, Gemini, storage, and test variants | Not copied over current versions: these would remove category/ranked search, source parsing fixes, summary provenance, hosted-storage enforcement, or current tests. |

The retained activity and prediction tables/functions are owned by this application. The earlier cleanup report could not identify their callers because it inspected the obsolete checkout. They must not be dropped as unused. In particular, `activity_records`, `activity_assessments`, `prediction_issues`, `prediction_resolutions`, `save_activity_case`, `prune_prediction_ledger`, `search_rule_catalog`, and `browse_rule_catalog` all have definitions or callers here.

## Read-only hosted database verification

The recovery check confirmed the following tables remained readable:

| Table | Rows observed |
| --- | ---: |
| `rule_catalog` | 3,954 |
| `rules` | 6 |
| `signals` | 57 |
| `forecasts` | 6 |
| `sync_runs` | 10 |
| `prediction_issues` | 8 |
| `prediction_resolutions` | 0 |
| `activity_records` | 5 |
| `activity_assessments` | 5 |

The REST schema still exposes `save_activity_case`, `prune_prediction_ledger`, `search_rule_catalog`, and `browse_rule_catalog`. This is a present-state read-only check, not a historical proof that no record ever changed. The old cleanup report stated that it deleted no application records; recovery itself performed no hosted writes, deletes, pruning, or migrations.

## Validation

- 63 tests passed under Node 22.
- Lint and TypeScript checks passed, including the recovered unused-code checks.
- Production Next.js build passed.
- Disposable PostgreSQL upgrade passed through all nine migration files, including immutable-ledger, activity-transaction, RLS, rollback, stale-write, retention, and remaining-index checks.
- The port 3000 homepage was verified in the browser with the new flowchart visible; port 3001 is no longer listening.

The consolidated source is committed and pushed before deploying with `npm run deploy:cloudflare`. GitHub pushes alone do not update the Worker; use the documented deployment command and verify the live site.
