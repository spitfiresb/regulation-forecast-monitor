# Live AI examples

The dropdown contains five publication links. Selecting one calls the same assessment API as browsing. For small-scale use, a completed assessment can be reused for up to one hour on the same UTC day, with its original check time displayed. This includes reviewed abstentions. Unavailable responses and research rejected during review are not reused. **Refresh history** sends `refresh=true`, retrieves the publication and linked history, runs research, validates the forecast, and reviews it. There are no bundled or prerecorded assessment responses, and a failed refresh never falls back to a selected past success.

| Document   | Topic                                               |
| ---------- | --------------------------------------------------- |
| 2026-19072 | EPA power plant greenhouse gas rules                |
| 2026-09067 | Defense contracting and foreign influence           |
| 2026-13347 | DOE new-construction nondiscrimination requirements |
| 2026-13304 | DOE nondiscrimination in education                  |
| 2026-13305 | DOE general nondiscrimination requirements          |

`lib/activity/examples.ts` contains navigation metadata only. `/?example=DOCUMENT_ID` uses the normal cache policy, including when opened directly or reloaded. Older valid example URLs use the same API, even if they are no longer curated. The dropdown remains plain text with underlined links and the user's disclaimer. All five selected publications have produced genuine forecasts through the live API. Repeat checks also observed model abstentions, validation rejections, provider throttling, and timeouts, so these are candidates for exploration, not guaranteed predictions.

A timed-out model request is retried once when at least ten seconds remain in its stage budget. Completed source actions are retained during that retry; the overall request deadline still applies. Exhausted timeouts display a temporary-unavailability message and a **Try again** button, separately from evidence-based abstentions.

A rejected forecast can be revised once using the review feedback and the same retrieved evidence, within the existing request budget. The revision must pass validation and a new review. Drafts, validation findings, and model reviews are preserved in the assessment's `ai.review_attempts`. This is not repeated sampling until approval. Source failure, unsupported reasoning, or a second rejected draft still produces no forecast. Success on selected records does not guarantee future model outputs or establish predictive accuracy.

Run `npx tsx scripts/check-examples.ts` for two fresh passes through every example on localhost. Pass `https://kobaltinterview.party` to check production. This check calls real services, prints every outcome, and fails on any missing, rejected, stale, or reused prediction. It does not save responses as product fixtures.

An additional screened DOE loan notice (`2026-17381`) has conflicting date fields: structured metadata points to the original publication date while the DATES paragraph explicitly postpones effectiveness until December 24, 2026. The status layer accepts only an unambiguous present-tense postponement in DATES, preserves the raw metadata, and discloses the discrepancy. It does not infer dates from historical recitals or select among conflicting new dates.

The OPM ALJ withdrawal (`2026-06445`) was excluded: its announced replacement proposal is already published under a different RIN (`2026-19222`), beyond the original linked proceeding. It must not be showcased as an outstanding restart forecast.
