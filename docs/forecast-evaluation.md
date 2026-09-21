# Publication forecast evaluation

## Current result

The historical cohort estimator and temporal replay are implemented. **Numerical forecasts are disabled**, because the outcome-label audit found a real false negative. The UI makes this limitation visible; a procedural label is never converted to a percentage.

The first run uses six archived agenda editions (Spring 2020, Spring 2021, Spring 2022, Fall 2022, Spring 2024, Spring 2025) and 36,642 proposed-rule metadata records from 2010–2026. It produced 3,060 candidate RIN-level examples: 2,017 training, 674 development, and 369 in the final temporal holdout. The holdout runs September 22, 2025 through March 22, 2026, and contains 74 candidate positive outcomes.

Preliminary binary Brier score: **0.1593** for the agency/stage estimator and **0.1621** for the pooled stage baseline. Lower is better. The difference is small, has not been established as statistically significant, and these scores are based on unapproved labels. They are neither an accuracy percentage nor evidence of validated live forecasting.

### Concrete failure found

The Spring 2020 agenda lists CFPB RIN **3170-AB02**, “Role of Supervisory Guidance,” with an upcoming NPRM. A matching interagency proposal was published November 5, 2020, inside the historical six-month window. Its Federal Register API metadata lists **3710-AB02**, not the agenda's **3170-AB02**. The initial exact-RIN join therefore labeled this a non-event.

- [Archived agenda entry](https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=3170-AB02&pubId=202004)
- [Federal Register metadata, document 2020-24484](https://www.federalregister.gov/api/v1/documents/2020-24484.json)
- [Official published PDF](https://www.govinfo.gov/content/pkg/FR-2020-11-05/pdf/2020-24484.pdf)

A broader title-candidate audit flagged 966 of 3,060 cases for possible identity review; these are **candidates, not 966 confirmed errors**. Thirty high-similarity candidates occur inside the forecast windows of apparent negative cases. Some clearly concern different proceedings, such as different crops or different annual hunting seasons. Similarity must never automatically change a legal publication label.

CFPB has only six cases in this run's refit cohort. The current corpus does not establish a reliable CFPB-specific estimate. A future pooled estimate must be labeled pooled, not presented as CFPB-specific validation.

## Reproduce

```sh
npm run evaluation:collect
npm run evaluation:audit
npm run evaluation:run
```

Collection caches official XML and API pages in ignored `.data/evaluation/`, with at most two concurrent downloads. API pagination counts must agree before a year's results are used. The current small report/model artifact is `data/evaluation/current.json`; detailed example IDs, frozen feature inputs, source hashes, split membership, candidate outcomes, and audit candidates remain in `.data/evaluation/`.

The collector does not modify operational Supabase history. It uses a conservative historical availability cutoff: the associated Federal Register introduction publication date, checked against its official API record. This is an available-by date, not a claim about the earliest online release. Document and field availability still need review before declaring the dataset point-in-time validated.

Method selection uses development data only. The final holdout chooses no smoothing parameter. Refit outcome windows must end before the final test origin. One origin per RIN avoids repeated snapshots counting as independent cases. Outcomes in complex procedures are excluded from the preliminary labeled sample and reported in collector exclusions; their effect on coverage/selection bias still requires analysis.

## Work remaining before enabling percentages

1. Review identity candidates and correct verified matches through a versioned, source-linked crosswalk. Include missing or malformed RINs and joint proceedings.
2. Audit negative cases beyond exact-RIN matching. Record unresolved cases and coverage rather than silently assuming absence.
3. Retain all originally eligible cases in the coverage denominator, including ambiguous outcomes. Review historical field revisions and eligibility consistency.
4. Freeze the corrected dataset and evaluation protocol. Re-run temporal tests; because this holdout has already been inspected, use a fresh holdout to make new model-improvement claims.
5. Add RIN-level uncertainty intervals, adequate calibration bands, and agency/period breakdowns. Apply all launch gates in `NEXT_STAGE_PLAN.md`; the present script implements only the preliminary gates and cannot release a model automatically.
6. Independently evaluate final-rule publication. The current empirical corpus concerns NPRMs only.

`enabled` remains false in the generated artifact even if the preliminary numerical scores look good. Do not switch it on just to populate the UI. The arithmetic estimator is tested with synthetic cases; those tests verify software behavior, not predictive validity.

## Directional outlook and missing dates (September 21, 2026)

The main screen now separates a **rules-based directional outlook**, an **AI-generated summary**, and **official records**. `publication-outlook-v2` predicts the next procedural direction from checked evidence without assigning adoption confidence or inventing dates. Proposal-stage actions can receive an outlook even without a scheduled NPRM. Missed targets are flagged, never rolled forward. Incomplete, stale, or ambiguous evidence suppresses the directional outlook.

A catalog audit found 230 of 3,954 entries without any timetable date in `MM/DD/YYYY` format, and 57 of 1,437 proposal-stage entries without a dated, plain `NPRM` row. These are format-based counts, not claims that the other entries have future or legally binding dates. The app parses dates for validity and preserves month precision.

New immutable assessments include the generated outlook and its evidence IDs. Prospective resolution now tracks these directional publication outlooks as well as numerical forecasts against the original six-month observation window. That window is an evaluation horizon, not a predicted publication date. Unobserved outcomes remain unresolved pending a complete negative-outcome audit. This is tracking infrastructure, not completed prospective validation.

A missing agency timetable should be an input to a future timing estimator, not an automatic exclusion. The next empirical model should include dated and undated rules, withdrawals, and right-censored cases; estimate publication within fixed 3-, 6-, and 12-month windows; and evaluate calibration and coverage separately for undated cases. Conditional time-to-publication ranges alone would hide the chance of no publication. No such time-to-event model is claimed as implemented or validated here; the existing historical label audit remains a release blocker for numerical estimates.

The follow-up label audit found that 25 of the 57 entries used equivalent proposal-action labels. After recognizing `Proposed Rule`, `Notice of Proposed Rulemaking`, and `Proposed NPRM`, 32 proposal-stage entries still lack a dated plain proposal action. These may have unusual or undetermined procedures, not necessarily no dates at all. The ingestion parser now recognizes those explicit aliases but rejects comment-end dates, ANPRMs, supplemental NPRMs, and companion direct-final actions as ordinary proposal targets. This expands directional-outlook date coverage without silently broadening the older empirical model's eligibility.
