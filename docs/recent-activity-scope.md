# Recent activity → research → future event

This is the current product scope. It supersedes the agenda-catalog discovery and fixed six-month publication forecast in the earlier build plan.

## User flow

1. Browse by agency and publication type across Federal Register rules, proposals, and related regulatory notices **published during the past six calendar months**, inclusive through the current UTC date. A future deadline or recent retrieval timestamp cannot make an older publication eligible.
2. Select one dated update. The app retrieves earlier and later related publications through the present day, without applying the six-month lower bound to that history.
3. Reconstruct the latest supported status from publication actions and dates. An effective-date delay is not another original final rule.
4. Investigate the proceeding and historical comparisons, then forecast a future publication event with a stated 90, 180, or 365 day window. The model selects this window separately from the browsing window.
5. Blue text and light-blue panels identify generated forecast prose and alternatives. Source facts and published dates remain neutral. Long official excerpts expand through **Read full listing**, and original publications remain linked.
6. Floating navigation opens Home, How it Works, and the MVP purpose dialog. The data model view focuses on the two active tables and the JSONB fields for sources and AI provenance.

## Sources and coverage

`GET /api/activity?q=...&page=...&agency=...&type=...` queries the Federal Register API directly, with publication-date bounds. It includes Rules and Proposed Rules, plus notices with a RIN or an identifiable procedural update. Unrelated meeting/grant notices are filtered out. Pagination follows source pages, so a page may have fewer than twenty qualifying records. No total count of qualifying activity is invented. Search has a one-minute, date-keyed process cache; it does not depend on an incomplete local backfill.

This scope is published Federal Register activity. It does not imply complete coverage of unpublished agency actions, agenda revisions, litigation, or all current regulations. Agenda entries with no recent publication do not enter this search. The older Reginfo catalog remains available to legacy APIs but is not the homepage's search source.

## Linking and current status

On selection, `POST /api/activity/[document]/assess` retrieves the selected document and searches all prior history by RIN, or exact docket text when no RIN exists. Documents must share an agency and, when both have docket IDs, a docket. Otherwise exact normalized title is required. Title-only identity is provisional and does not produce a forecast. Unlinked identifier matches dated on or after the selected update, or incomplete pagination, cause abstention. Older unmatched proceedings are disclosed and excluded; a delay still cannot be forecast without linking its original final rule. Up to 1,000 publications per identifier are inspected; a cap hit is not labeled complete.

The document ACTION field and abstract distinguish final publication, proposal, delay, withdrawal, comment-period update, correction, amendment, and related notice. Dates come from structured publication fields, with the original DATES wording retained for review. Same-day conflicting actions, corrections, missing original rules, or unresolved identities are not forced into a simple progression. A past effective date does not prove a rule is legally in force.

The DOE regression fixture records one original direct final rule and five effective-date extensions. The latest notice, 2026-13305, published July 1, 2026, explicitly sets December 28, 2026 as the delayed effective date. The March 6 update is outside the current March 21–September 21 search window but remains part of the selected rule's history.

## Forecast method and limits

`research-event-agent-v3` combines deterministic source-status checks with a bounded Gemini research agent. The model receives the checked current history and chooses up to two source actions per round, for three rounds maximum. Each new plan sees previous tool observations. It can:

- `read_publication`: retrieve official full text for a known document ID and inspect up to about 14,000 characters of query-relevant passages. Longer documents are explicitly labeled as selected excerpts. Null formatting characters are removed for JSONB compatibility. If Federal Register text is unavailable, the corresponding official GovInfo HTML is used after checking its document identifier. The exact text-source URL is archived.
- `find_comparables`: search same-agency publications from up to 15 years ago, predating the current proceeding. Up to eight results are discovery candidates, not a representative cohort.
- `trace_comparable`: retrieve a candidate's linked history through the assessment date. A proposal-to-final interval is computed only for complete, reliably linked history. Cases with more than 40 linked documents exceed this research budget.

The agent must read the current publication and complete a historical search. Only current-history sources, inspected comparison text, or reliably traced comparison sources can support citations. Search matches alone cannot. Incomplete comparisons cannot support timing intervals. The final model call selects a future publication event and a 90, 180, or 365 day horizon, with cited reasons, counterargument, alternatives, horizon justification, watch signals, and missing evidence. It must abstain if no case-specific evidence distinguishes outcomes. Current status and published timing remain copied from source checks.

The structured response is validated for applicable events, eligible citations, a latest-publication citation, and absence of numerical probabilities. A second model call reviews evidence, comparative reasoning, and timing. It rejects summaries of the present stage masquerading as predictions. This critique uses the same underlying model and is not independent human verification. The request has a bounded time budget; missing configuration, unavailable sources, failed validation, or failed review withholds the prediction. There is no deterministic prediction fallback. Cached cases require current method, model, and prompt versions; unsuccessful research is retried on the next request.

The complete action trace, exact source passages inspected, historical comparison metadata, target event, issue time, window end, and model review are archived with the case. `forecast-contract.ts` provides outcome resolution against subsequent complete Federal Register history, scoped to publication events. It is a foundation for future evaluation, not an operational accuracy score or scheduled evaluation job.

The method has no validated predictive accuracy or calibrated probabilities. Selected examples cannot establish agency-wide base rates. The previous NPRM-only evaluation does not validate this broader model. Proper evaluation requires frozen historical information, subsequent observed events, abstention coverage, and comparison against simple baselines. Unpublished decisions, litigation, missing identifiers, and unobserved comments remain outside current source coverage.

## Storage

Migration `202609210008_recent_activity.sql` adds:

- `activity_records`: latest retrieved case, keyed by selected Federal Register document number.
- `activity_assessments`: immutable, content-addressed copies of history and generated assessments. Identical payloads deduplicate. A newly issued forecast has its own issue time and is retained as a new assessment.

Both tables use RLS and server-only access. The service role can update the latest record but cannot update or delete archived assessments. Search eligibility is calculated from publication dates on every query, independently of stored-record retention. Existing six-month operational snapshot cleanup does not delete selected older source context from these records.

The old six-month-forward probability experiment and legacy pages remain in the repository for reference; the new main flow does not use their forecast window or displayed percentages.
