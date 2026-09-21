> **Superseded product scope:** The main app now follows recent activity → full related history → next-status assessment. Six months is the backward-looking publication search window. See [the current scope](docs/recent-activity-scope.md). The fixed forward forecast window and agenda-catalog discovery below describe the earlier implementation, not the current product contract.

# Next stage: searchable regulatory forecasts

Status: implementation plan for review. No product, UI, database, or ingestion changes are authorized by this document alone. Begin implementation after the catalog/storage agent finishes and the user asks to build this stage.

## 1. Outcome we are building toward

A compliance employee searches for a regulatory topic, selects a rulemaking, and sees:

> What change is being considered, what event we predict next, its estimated chance within six months, and the evidence and historical testing behind that estimate.

The forecast is the main product output. Search and source summaries support it. A searchable catalog with stage labels is not a completed forecasting MVP.

We have no customer business profile, products, documents, or contacts. Do not personalize applicability, recommend internal owners, or claim that a customer must take a particular action. State scope described in the sources and let the user judge relevance.

Working product name: **Regulatory Forecast Monitor**. One customer-facing page. Preserve the simple layout; polish through hierarchy, wording, responsiveness, and complete interaction states.

## 2. Handoff from the current agent

The supplied transcript describes work in progress, not a confirmed hosted deployment. At planning time this checkout still exposes the original single-rule model. Reconcile the finished implementation before writing migrations or editing shared files.

Expected handoff:

- Multiple rule IDs/RINs with per-rule storage isolation.
- A searchable agenda catalog. The agent reports 3,954 records; use the actual imported count, never a fixed UI number.
- Latest state retained independently of change-only historical versions.
- Six calendar months of operational history; unchanged refreshes update check times without duplicating full snapshots.
- Distinction between a catalog entry and a record actually checked by this monitor.
- Supabase migration and import status, with confirmation of the target project. The transcript reports a local import while the hosted target was unresolved.
- Passing migration tests on an existing populated database, ingestion tests, and documented limitations.

Before integration, inspect the finished schema, migrations, endpoints, and tests. Confirm the catalog is queryable in the intended Supabase project. Preserve unrelated working changes, including any separately requested architecture pages; do not change their navigation as part of the customer UI without reconciling those instructions.

The catalog includes proposed, final-stage, completed, prerule, and long-term entries. Do not describe all entries as active or verified. An agenda catalog is not the entire body of federal regulations. A search for “Regulation Z” can return several separate rulemakings affecting it. Reginfo describes entries as rulemaking proceedings and uses RINs to identify them. [Reginfo guide](https://www.reginfo.gov/public/jsp/eAgenda/UA_HowTo.myjsp)

## 3. Exactly what we predict

V1 predicts publication events for an identifiable rulemaking, not exact final wording, eventual court survival, or whether a whole regulation will ever change.

| Current verified situation | Forecast question | Outcome that counts |
| --- | --- | --- |
| Planned proposal; no matching published proposal established | Will a matching NPRM be published within six months? | Verified publication of the relevant NPRM during the forecast window |
| Published proposal, or supported final-rule-stage action; no matching final rule established | Will a matching final rule be published within six months? | Verified publication of the final rule for that proceeding during the window |
| Matching final rule already published | No forecast of that publication | Show the known event and sourced dates |
| Withdrawal, conflicting documents, uncertain identity, unsupported procedure, or insufficient data | No numerical estimate | Explain the specific reason and what evidence is missing |

Start numerical forecasting with the first target. Add the second through the same evaluation process; do not transfer performance claims from one target to the other.

Forecast window: six **calendar months** from the forecast's issue date, with month-end clamping. Store exact start/end boundaries in UTC and a separate evidence cutoff. Count a publication after the cutoff and on or before the displayed end date. If publication already occurred by the cutoff, it is a fact, not a future prediction. Reject future-dated records as current publication evidence.

Target selection must be deterministic and versioned. A change in target creates a new forecast record. “Completed Actions” alone does not establish that a final rule exists. An advanced notice, correction, supplemental proposal, or interim/direct final rule needs explicit classification; exclude unsupported cases from the initial evaluation and numerical coverage.

Publication of a final rule is distinct from its effective date and any compliance dates. Do not infer either date or imply that final publication establishes present enforceability in every circumstance.

## 4. What the user sees

### Search and selection

One route, `/`, with query and selected RIN in URL parameters so reload/back navigation preserves context.

1. Search by topic, title, agency, RIN, or CFR citation. Use Postgres text search and exact identifier matching first; no embeddings or LLM dependency for basic retrieval.
2. Show compact result rows: readable title, agency, source-reported stage, one-line subject description, and whether publication evidence has been checked.
3. Default to relevance, not predicted probability. Match exact RIN first. Rank title/citation matches above incidental abstract mentions.
4. Selecting a result expands its detail on the same page. Preserve the result list and search position. Avoid a sidebar dashboard, modal maze, or secondary customer pages.
5. Display catalog import time separately from the selected rule's last official-source check.

Use a search-submit interaction initially, pagination, and at most a small agency/status filter if needed by real test queries. Do not add controls that lack working behavior. Explain that results cover the imported agenda catalog; an empty result does not prove no relevant law exists.

### Selected rule: reading order

1. **Subject:** short title plus a two-sentence explanation of the contemplated change. Preserve the official title in evidence.
2. **Forecast:** predicted publication event, six-month window, chance estimate when eligible, and an always-visible experimental label.
3. **Why:** up to three concise evidence points, including contrary evidence or gaps. Expand inline for original wording and historical comparison details.
4. **Official information:** agenda stage, separately verified publication status, affected scope/CFR parts, and separately labeled agenda targets, comment deadlines, publication dates, effective dates, and compliance dates when supported.
5. **What changed:** meaningful differences from the previous check; distinguish source changes, forecast recalculations, and changed AI wording.
6. **Sources and testing:** check timestamps, original links, and an inline explanation of the method's historical results. No separate methodology page is required.

Illustrative layout; placeholders must never render as actual claims:

```text
Regulatory Forecast Monitor
[ Search topics, rule names, agencies, or RINs… ] [Search]

Results …

APOR backup calculations
CFPB · RIN 3170-AB57
AI summary · based on the linked agenda abstract
[Two-sentence description]

OUR FORECAST · EXPERIMENTAL
[Proposal publication] by [six-month window end]
[Estimated chance, only when a supported model is available]

[Main evidence]   [Contrary evidence or uncertainty]
▸ Why this forecast?

OFFICIAL INFORMATION
Agenda stage: …          Publication status: …
Agency target: …         Effective date: …

CHANGES SINCE THE PREVIOUS CHECK
…
▸ Sources and historical testing
```

Chance and evidence quality are different. Do not append “medium confidence” to a stage. A well-supported estimate can indicate a low chance; a high model estimate can still have substantial uncertainty.

Use percentages only after the eligibility gates below pass. Round display to whole percentages and expose sample support/uncertainty in the explanation. Do not use a decorative gauge or a green “safe” indicator. If numerical support is absent, show “Chance not yet estimable: [reason]”; a qualitative “moderate” label is not a loophole around validation.

### Required interaction states

| State | Behavior |
| --- | --- |
| Catalog-only result | Show agenda information immediately; say publication evidence has not been checked |
| First evidence check | Check only the selected rule; show progress and keep catalog information visible |
| Existing checked result | Load saved detail immediately; show its age and a working refresh action |
| Source failure | Retain previous evidence with its original date; identify the failed source; do not claim fresh verification |
| Insufficient forecast support | Keep the forecast question visible and explain the missing basis |
| No relevant results | Explain search coverage and suggest a broader phrase or exact identifier |
| Ambiguous identity or procedure | Show evidence and “Manual review needed”; do not force a forecast |
| Rule changes while a request is loading | Discard the stale response so it cannot overwrite another rule's detail |
| AI unavailable | Show an official excerpt; facts, search, and forecasts remain usable |

Keyboard navigation, clear focus, readable contrast, mobile layout, sensible loading states, and functional source links are completion requirements. Keep primary facts visible; collapse supporting detail only.

## 5. Facts, generated text, and predictions

| Label | Owner | Allowed content |
| --- | --- | --- |
| Official information | Source parser plus verification | Structured dates/status, quotations, document identity, explicit source scope |
| AI summary | Gemini | Plain-English paraphrase of supplied text, with passage references |
| Our forecast · experimental | Versioned forecasting method | Defined event, horizon, estimated probability, limitations, evidence |
| AI explanation | Gemini, optional | Explanation of supplied model output and supported evidence; no new estimates |

Every generated claim must link to relevant source passages or an explicit model result. A valid URL alone does not establish that a claim is supported. Display missing scope as “Not established by the available sources”; do not manufacture a business applicability judgment.

LLM requests receive the selected rule's bounded source material, structured facts, and approved forecast output. Source text is data, not instructions. Store prompt/model versions and input hashes; cache against those inputs. Validate output shape, references, dates, and contradictions with structured facts. Use human review of a test set to assess substantive faithfulness; schema checks cannot prove it.

For historical evaluation, exclude LLM-generated free-text features. A current LLM may already know later outcomes even when the prompt says “as of” a past date. Evaluate the deterministic/empirical forecasting method independently of prose.

## 6. How the chance estimate will be produced

V1 should use an explicit **historical cohort estimator**, not invented points for progress and not a general-purpose LLM's numerical guess. It can run in TypeScript using a small versioned statistical artifact; no separate inference service or complex ML platform is needed.

For a target event, compare the current case with historical cases observed at comparable points. Count how often the event occurred within six months. Start with event type and procedural stage, then evaluate whether agency-specific information improves estimates.

Recommended candidates:

1. Overall event base rate: benchmark only.
2. Stage-conditioned historical rate: the primary simple baseline.
3. Agency-and-stage cohort rate, smoothed toward the stage rate when the agency sample is small: initial candidate forecast method.

Candidate formula: `(agency_events + k × stage_rate) / (agency_cases + k)`. Choose the smoothing strength `k` on development data, not the final test set. Derive all counts from outcomes already resolved before the model training cutoff. Record exactly which historical examples contributed.

Potential later refinements: time since proposal publication, recent verified activity, agency target relative to the forecast window, and documented timetable revisions. Only use a variable when it is reconstructable at the historical cutoff and shows useful performance on development data. Missing values are explicit. No hand-selected “+20% for comments closed” adjustments.

An evidence point is not automatically a model driver. If the model uses agency and stage only, say so. A missed target can be displayed as relevant uncertainty, but do not claim it reduced the percentage unless it actually enters the tested method. Similarly, do not assume a legal deadline guarantees publication or that an old timetable proves an action was abandoned.

If the richer candidate cannot improve on the stage baseline, retain the simpler baseline as a clearly described historical estimate where supported. Do not market additional predictive insight that evaluation has not demonstrated. Unsupported agencies/procedures can remain searchable without receiving percentages.

## 7. Historical data: the dependency we must solve first

The latest catalog is a present snapshot. Six months of retained observations is an operational policy, not six months of reconstructed historical evidence. A new six-month forecast takes six months to mature; a new import cannot prove forecasting skill on day one.

Reginfo provides older agenda editions in XML. Use archived editions to reconstruct what was known, and published Federal Register documents to establish later events. Verify availability, relevant dates, field consistency, and linkage before promising numerical coverage. [Reginfo XML archives](https://www.reginfo.gov/public/do/eAgendaXmlReport)

Proposed backfill: initially inspect several archived editions spanning roughly three to five years, then choose a documented cohort with sufficient mature outcomes. This is a research target, not a claim that a clean dataset already exists. Expand the period or narrow agency coverage if required. Historical administrations and procedures may differ; report performance by period rather than assuming older behavior transfers unchanged.

For each historical example preserve:

- Rulemaking identity and target event.
- Cutoff at which a prediction could have been made.
- Source edition and its verified public availability date.
- Source publication date, observed/retrieved time, and content hash as separate fields.
- Features available at that cutoff; no later abstracts, corrected timetables, or current stage substituted backwards.
- Six-month horizon end and matching outcome documents.
- Label, coverage limitations, and any manual identity review.

Do not decode an agenda's actual release date from a URL token such as `pubId`. The displayed edition label, machine identifier, and release date can differ. If historical availability cannot be established, exclude that example from point-in-time claims.

RIN is the initial join key, not sufficient proof that every matching document is the target event. Check agency, document type, proceeding relationship, and corrections/withdrawals. Title searches can find additional candidates with missing RIN metadata; require explicit identity confirmation before promoting them to outcome evidence. Do not label title similarity as verified matching.

FederalRegister.gov supports discovery and structured data, and links to official published documents. Preserve the official PDF/govinfo link for source inspection when available; its site explains the distinction between its web rendition and the official legal edition. [Federal Register API and publication notice](https://www.federalregister.gov/developers/documentation/api/v1)

### Six-month retention needs a separate evaluation policy

Keep the user's six-month policy for operational rule history. Do not silently extend that cleanup window or backfill all older records into it.

Recommended design to approve with this plan: retain a compact, immutable prediction/evaluation ledger separately, through each forecast's resolution and a defined audit period. Proposed initial retention is 12 months from issue, with compact evaluation artifacts retained by version. Retain the necessary evidence excerpts/features with the ledger; a hash pointing to deleted content is not reproducible evidence.

Older public reference examples used for backtesting should live in a versioned evaluation dataset, not the six-month UI history table. Measure its size before deciding whether it belongs in Supabase or a separate artifact store. Store document links and required excerpts instead of full PDFs. This is an explicit proposed retention exception for evaluation, not a change already made by the catalog agent.

If all storage must expire after six months, document the resulting inability to retain six-month forecasts through later resolution review. Do not claim a durable prospective audit under that policy.

## 8. How we test predictions

### Historical replay

For each historical cutoff, construct the evidence as it was then, issue the forecast, and compare it with events during the next six calendar months.

- Train on older periods, select the method on a later development period, then freeze it before evaluating the newest fully matured test period.
- Training labels must already be resolved by the simulated model-training date. Purge overlapping outcome windows across fitting and evaluation boundaries.
- Include all eligible entries from the historical edition, including those that did not advance. Do not construct the cohort only from today's survivors or successfully finalized rules.
- Start with one evaluation origin per RIN per target to avoid counting many correlated versions as independent evidence. If repeated forecasts are evaluated later, group statistics and uncertainty by RIN and report the weighting scheme.
- Apply identical eligibility and abstention rules to models and baselines. Report coverage, including excluded and unresolved cases, so selective prediction cannot masquerade as universal accuracy.
- Separate retrospectively reconstructed forecasts from genuinely issued live forecasts. Never backdate a newly generated forecast as though it existed then.

### Outcome definitions

| Outcome | Meaning |
| --- | --- |
| Occurred | Verified matching target publication during the original window |
| Did not occur within window | Full horizon elapsed and adequately checked sources establish no matching event under the documented labeling protocol |
| Pending | Horizon has not elapsed and target event has not occurred |
| Unresolved | Missing coverage, uncertain document linkage, or conflicting evidence prevents a trustworthy label |

A rule can be published after the window and still be a negative outcome for that particular six-month forecast. Withdrawal after issuance is recorded as evidence, but does not rewrite the original prediction; resolve the defined publication question at its horizon. A target publication followed by withdrawal still counts as publication, with withdrawal noted separately. We are not forecasting permanent legal survival.

Do not label “nothing returned by one API call” as a definitive negative. Audit candidate negatives with broader searches and document coverage. Incomplete cases remain unresolved and are included in coverage reporting, not silently dropped from the report.

### Measures

| Measure | Question it answers |
| --- | --- |
| Brier score | How close were the probabilities to the binary outcomes? Lower is better |
| Calibration by probability band | Did events predicted around a given chance occur at roughly that rate? |
| Baseline comparison | Did the candidate improve on overall and stage-only historical rates? |
| Sample support and uncertainty | Are apparent differences credible or based on a handful of cases? |
| Coverage | What share of eligible searches can receive a supported estimate? |
| Agency/time/target breakdown | Is aggregate performance hiding failures in a particular setting? |

Calculate binary Brier score as `mean((probability - outcome)^2)` on unrounded probabilities. Inspect calibration separately; a better Brier score alone does not establish good calibration. Use RIN-level resampling for uncertainty when examples are correlated. [Brier score definition](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.brier_score_loss.html) and [calibration guidance](https://scikit-learn.org/stable/modules/calibration.html).

Do not use a single “accuracy” percentage as the headline. A model that always predicts no event can look accurate when events are rare.

### Eligibility and display gates

Before numerical launch, create and freeze an evaluation protocol on development data. Proposed conservative MVP guardrails, not scientific guarantees:

- At least 200 distinct resolved RIN-target examples for the launched target overall, including at least 30 events and 30 non-events.
- At least 100 distinct resolved examples in the final temporal holdout for that target, with at least 20 of each outcome; otherwise call the evaluation preliminary and withhold numerical product claims.
- Report calibration only for bands with at least 30 cases; merge adjacent bands when needed. Show sampling intervals. Suppress deployment for a supported band with a discrepancy above 15 percentage points unless the discrepancy is resolved on development data and reevaluated on fresh holdout data.
- Publish an agency-specific estimate only with adequate agency examples and held-out support; initial agency minimum 30 distinct resolved cases. Otherwise explicitly use an eligible pooled estimate or abstain. Do not imply agency-level validation from pooled performance.
- Candidate Brier score must not be worse than the stage baseline on held-out data. Claim improvement only with supporting uncertainty estimates; otherwise describe performance as indistinguishable and prefer the simpler method.
- Reject stale or incomplete current inputs: initial freshness target 24 hours for a numerical forecast, with the actual cutoff shown. A retained old forecast can be viewed as dated history, not presented as fresh.
- Human audit finds no unresolved material identity, timestamp, or outcome-label errors in the reviewed sample. Audit at least 30 varied cases, including negatives and ambiguous cases, before publication.

If these gates fail, do not relabel a heuristic score as probability. Deliver the diagnostic report, repair the data or narrow supported coverage, and rerun evaluation. Numerical forecasting remains an incomplete milestone until supported.

### Live follow-through

Save every issued forecast immutably with issue time, target, end date, features, evidence, estimate, method version, and applicable evaluation report. Append revisions; do not overwrite the original. Resolve outcomes when evidence arrives and run a final coverage check after the horizon. Report live results separately from retrospective tests.

## 9. Data/API contracts to add after handoff

Extend the finished catalog schema rather than replacing it. Separate the existing deterministic procedural assessment from the new probabilistic forecast; legacy `likelihood = DEVELOPING` is not a probability.

Logical records, to map onto existing tables where appropriate:

| Record | Required information |
| --- | --- |
| Source/evidence version | Rule identity, source URL, official publication link, source date and precision, public availability date when known, observation time, content hash, retained relevant wording |
| Forecast issue | Immutable ID, rule/target ID, issued/cutoff/end times, probability or null, eligibility reason, model/dataset versions, evidence IDs, frozen feature values, superseded-issue reference |
| Forecast rationale | Supported model drivers, contextual evidence, contrary evidence, limitations, claim origin, LLM/prompt version when used |
| Historical example | Cutoff, target/window, point-in-time features/evidence, label, outcome links, identity review, inclusion/exclusion reason |
| Evaluation run | Frozen method/protocol versions, training/development/test periods, sample counts, Brier/baseline results, calibration bands, uncertainty, coverage, agency/target breakdowns |
| Forecast resolution | Issue ID, outcome, event date/document, resolution/check date, matching method, unresolved reason, revision audit trail |

Use separate `event_probability` and `forecast_status` fields; do not reuse the old text confidence field. Recommended statuses: `experimental`, `insufficient_evidence`, `review_required`, `not_applicable`, `stale`. Backtest evaluation does not automatically remove the experimental label.

Proposed endpoints, names adjustable to the completed agent's API:

- `GET /api/rules?q=...&agency=...&cursor=...`: bounded search with actual source coverage.
- `GET /api/rules/[rin]`: saved official facts, selected rule's summaries/forecast, and prior-check changes.
- `POST /api/rules/[rin]/refresh`: bounded source check, save, deterministic target selection, eligible forecast computation, and optional AI explanation. Coalesce per rule, not globally across different rules.
- `GET /api/forecasts/[id]/evidence`: exact evidence used by that immutable forecast.
- `GET /api/evaluations/[version]`: bounded public-facing method/results summary used by the inline disclosure.

GETs do not create forecasts or invoke paid/limited model calls. On first selection, the client can initiate the explicit refresh operation for that selected rule. Search never triggers thousands of refreshes or Gemini calls. Cache summaries by source/model/prompt version and forecasts by evidence/feature version plus forecast origin policy.

Keep all application behavior in the existing Next.js repository. Offline dataset preparation and evaluation can be scripts; no extra frontend/backend split, Edge Functions requirement, or vector database is necessary. Persist model artifacts and evaluation versions before presenting predictions.

## 10. Implementation order and checkpoints

### A. Verify the completed storage handoff

Confirm project/schema/import, rule isolation, source identity/date precision, change-only history, and six-month cleanup. Document the distinction between retained observations and any actual historical backfill. Reconcile evaluation-ledger retention before adding cleanup behavior.

Deliverable: a short integration checklist with actual table/API names and measured storage footprint.

### B. Prove historical evaluation is feasible

Fetch a small set of archived editions; verify release dates, join to outcomes, inspect negatives and ambiguous document types, and build the first point-in-time examples. Prioritize one target and a supportable agency cohort rather than promising all-agency numerical coverage.

Deliverable: versioned sample dataset, coverage/error audit, and explicit go/no-go for numerical forecasting. Do this before spending the build on visual polish.

### C. Build the estimator and backtest

Implement target selection, baselines, smoothed cohort candidate, temporal replay, metrics, eligibility gates, and immutable forecast records. Freeze the protocol before final holdout evaluation. Produce actual results, including failures and abstentions.

Deliverable: reproducible evaluation command, model artifact, report, and supported target/agency scope. If data gates fail, return to B or narrow scope; do not call this completed forecasting.

### D. Connect search and the single-page detail

Implement catalog search, URL state, result selection, per-rule refresh, current evidence, and the forecast-first detail layout. Test successful, stale, unsupported, empty, and failed-source cases. Keep source facts separate from forecasts in both types and display.

Deliverable: functioning search-to-forecast journey backed by Supabase and the evaluated method.

### E. Add bounded AI summaries and explanations

Generalize APOR-specific summary logic, remove company-context language, connect generated claims to evidence, and preserve official-text fallback. Explain only factors that actually contributed to the method, labeling other context separately.

Deliverable: reviewed samples across agencies and statuses, including no-key/quota/failure behavior.

### F. Polish and verify

Test narrow/mobile viewports, keyboard interactions, long titles, sparse records, query reload/back behavior, loading/error states, and source links. Run appropriate unit/integration tests, lint, type checks/build, and the actual database migration checks. Verify one live end-to-end search/refresh/forecast/evidence path. Keep historical metrics reproducible and separate from mocked tests.

Deliverable: a polished MVP and an honest demo script identifying experimental scope and actual measured performance.

## 11. Acceptance criteria

- [ ] User can search by topic, agency, RIN, and CFR citation, and select a rulemaking without leaving the main page.
- [ ] No APOR-only constants or copy leak into other agencies' records.
- [ ] A supported result states one specific predicted event, a fixed six-month window, and a tested chance estimate.
- [ ] Unsupported cases explain abstention without invented qualitative or numerical certainty.
- [ ] Facts, AI summaries, model output, and AI explanations are visibly distinguishable.
- [ ] Every forecast can reproduce its evidence/features and link to the correct method/evaluation version.
- [ ] Agency timetable targets are distinct from forecast windows and published legal dates.
- [ ] Current source failures never appear as evidence that a publication does not exist.
- [ ] Historical replay excludes future information and reports mature outcomes, unresolved cases, baselines, calibration, and coverage.
- [ ] Prospective issues remain immutable and resolvable under an agreed retention policy.
- [ ] The UI contains no customer-specific applicability claims, contacts, owners, or required-action advice.
- [ ] Search, refresh, inline evidence, pagination, and failure/retry behavior work; no placeholder controls or demo probabilities ship as real data.
- [ ] The user can understand the predicted event, timeframe, basis, and uncertainty within 30 seconds.

## 12. Explicit non-goals

Customer onboarding/context collection; internal contacts; document re-review; alerts/watchlists; full CFR legal research; political sentiment; exact wording prediction; judicial survival forecasts; automated legal applicability decisions; broad statistical-model exploration; and customer-facing secondary pages.

These can be later features. This stage is complete only when search leads to an evidence-backed, historically evaluated forecast for a clearly stated supported scope—not merely a more attractive status catalog.

## Implementation status — September 21, 2026

The other agent's multi-rule backend is integrated into the running checkout. The hosted Kobalt Interview Supabase catalog contains 3,954 entries; six months remains the operational history-retention window, with no invented historical forecasts.

Implemented:

- Single-page catalog search, relevant results, pagination, URL navigation, and per-rule source refresh.
- Explicit separation of official records, Gemini plain-English summaries, and experimental publication assessments, with inline evidence.
- Specific NPRM/final-publication targets and fixed six-calendar-month assessment windows. Unsupported, incomplete, and stale cases abstain.
- Immutable assessment/evidence records and outcome-resolution scaffolding. The evaluation ledger has separate 12-month retention; operational rule history still has six months.
- Historical collection, candidate-label audit, agency/stage estimator, temporal replay, and a versioned report displayed in the testing disclosure.
- Live end-to-end checks for APOR and another agency, empty searches, 44 automated tests, database checks, lint, and a passing production build.

**Numerical forecasting is not complete and remains disabled.** The initial 3,060-case historical dataset contains a verified false negative caused by a mismatched RIN in Federal Register metadata. Preliminary test scores cannot justify publishing percentages. The next substantive step is a reviewed identity crosswalk and negative-outcome audit, followed by the remaining validation gates—not turning on the existing estimator.

See [the evaluation report](docs/forecast-evaluation.md) for actual results, the source-linked failure, reproducible commands, and the remaining release criteria. See [the data-model documentation](docs/data-model.md) for the implemented APIs and retention policies.

### Revised product direction — one search, one record

The latest user request replaces the browsing-first homepage with one search and a compact match selector, followed by one record. The record leads with the generated directional outlook, then the explicitly labeled AI summary and a compact official-facts strip. Dates in the agency timetable stay separate from generated timing analysis. Evidence and validation live in inline disclosures.

Directional outlooks now work without a scheduled NPRM; their immutable records can be tracked prospectively. Numerical chances and date estimates remain gated. See `docs/forecast-evaluation.md` for the missing-date audit and the required dated/undated time-to-event evaluation. This revision does not claim that a procedural outlook solves adoption-probability forecasting.
