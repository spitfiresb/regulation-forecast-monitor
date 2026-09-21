# Recent activity → history → next status

This is the current product scope. It supersedes the agenda-catalog discovery and fixed six-month publication forecast in the earlier build plan.

## User flow

1. Search Federal Register rules, proposals, and related regulatory notices **published during the past six calendar months**, inclusive through the current UTC date. A future deadline or recent retrieval timestamp cannot make an older publication eligible.
2. Select one dated update. The app retrieves earlier and later related publications through the present day, without applying the six-month lower bound to that history.
3. Reconstruct the latest supported status from publication actions and dates. An effective-date delay is not another original final rule.
4. Generate an explicitly experimental assessment of the next status, with evidence and alternatives. Six months is **not** a prediction deadline.

## Sources and coverage

`GET /api/activity?q=...&page=...` queries the Federal Register API directly, with publication-date bounds. It includes Rules and Proposed Rules, plus notices with a RIN or an identifiable procedural update. Unrelated meeting/grant notices are filtered out. Pagination follows source pages, so a page may have fewer than twenty qualifying records. No total count of qualifying activity is invented. Search has a one-minute, date-keyed process cache; it does not depend on an incomplete local backfill.

This scope is published Federal Register activity. It does not imply complete coverage of unpublished agency actions, agenda revisions, litigation, or all current regulations. Agenda entries with no recent publication do not enter this search. The older Reginfo catalog remains available to legacy APIs but is not the homepage's search source.

## Linking and current status

On selection, `POST /api/activity/[document]/assess` retrieves the selected document and searches all prior history by RIN, or exact docket text when no RIN exists. Documents must share an agency and, when both have docket IDs, a docket. Otherwise exact normalized title is required. Title-only identity is provisional and does not produce a forecast. Unlinked identifier matches dated on or after the selected update, or incomplete pagination, cause abstention. Older unmatched proceedings are disclosed and excluded; a delay still cannot be forecast without linking its original final rule. Up to 1,000 publications per identifier are inspected; a cap hit is not labeled complete.

The document ACTION field and abstract distinguish final publication, proposal, delay, withdrawal, comment-period update, correction, amendment, and related notice. Dates come from structured publication fields, with the original DATES wording retained for review. Same-day conflicting actions, corrections, missing original rules, or unresolved identities are not forced into a simple progression. A past effective date does not prove a rule is legally in force.

The DOE regression fixture records one original direct final rule and five effective-date extensions. The latest notice, 2026-13305, published July 1, 2026, explicitly sets December 28, 2026 as the delayed effective date. The March 6 update is outside the current March 21–September 21 search window but remains part of the selected rule's history.

## Forecast method and limits

`recent-activity-status-v1` is a transparent heuristic assessment, **not a calibrated statistical model or an LLM prediction**. Successive delays promote another delay as the leading scenario while retaining scheduled effectiveness and withdrawal as alternatives. Single delayed/final publications with future dates point toward scheduled effectiveness. Proposals point toward comment review or an agency decision. Withdrawals point toward inactivity absent a restart. Incomplete or ambiguous records abstain.

The model makes no claim of validated predictive accuracy, percentage confidence, or invented event dates. Recurring delays alone do not establish a numerical likelihood. The previous NPRM-only historical evaluation does not validate this broader status model and is not shown as if it did. Validation for this model requires frozen historical status assessments, subsequent observed transitions, comparisons against a status-unchanged baseline, and separate review of ambiguous/no-action cases. No new arbitrary prediction horizon has been imposed.

## Storage

Migration `202609210008_recent_activity.sql` adds:

- `activity_records`: latest retrieved case, keyed by selected Federal Register document number.
- `activity_assessments`: immutable, content-addressed copies of history and generated assessments. Retrieval time does not create duplicate issues; substantive evidence or output changes do.

Both tables use RLS and server-only access. The service role can update the latest record but cannot update or delete archived assessments. Search eligibility is calculated from publication dates on every query, independently of stored-record retention. Existing six-month operational snapshot cleanup does not delete selected older source context from these records.

The old six-month-forward probability experiment and legacy pages remain in the repository for reference; the new main flow does not use their forecast window or displayed percentages.
