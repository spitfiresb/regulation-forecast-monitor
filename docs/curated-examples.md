# Curated AI examples

Six dated examples appear below the agency and publication filters. Five are additional examples; `2026-13305` is the original DOE demonstration. All were assessed on September 21, 2026 and selected for substantive AI text, cited reasoning, an inspected official source, and a passed model review. Selection does not demonstrate forecast accuracy or typical coverage.

| Document | Topic | Why it is included |
| --- | --- | --- |
| 2026-19072 | EPA power plant greenhouse gas rules | Distinguishes remaining rulemaking from a partial repeal and inspects a historical proposal-to-final interval. |
| 2026-09067 | Defense contracting and foreign influence | Connects statutory mandates with a completed historical defense rulemaking and discusses coordination risk. |
| 2026-13347 | DOE new-construction nondiscrimination requirements | Explains the interagency dependency behind repeated effective-date postponements. |
| 2026-13304 | DOE nondiscrimination in education | Discusses delay, withdrawal, and signals that would change the assessment. |
| 2026-13302 | NRC low-level radioactive waste disposal | Provides a substantive AI explanation for abstention. Its saved assessment explicitly says it cannot yet support a prediction. |
| 2026-13305 | DOE general nondiscrimination requirements | Retains the original demonstrated delay forecast and its evidence. |

`lib/activity/examples.ts` is the navigation index. `public/examples/*.json` contains the unchanged assessment payloads, including issue times, citations, research actions, inspected passages, review, and original fingerprints. Opening `/?example=DOCUMENT_ID` fetches this saved output without calling the model or overwriting the live case. The saved-example banner and “Status at assessment” label distinguish it from current research. “View latest assessment” and “Refresh history” leave example mode and run the normal live flow.

The dropdown is a plain-text disclosure with underlined, clickable titles. The disclaimer remains visible below it and uses the user-provided wording verbatim, including its spelling. Tests check all links, source coverage, approved AI provenance, forecast windows, the explicit abstention label, and original content fingerprints.
