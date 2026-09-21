# Official source fixtures

Retrieved from Reginfo on September 21, 2026 (UTC):

- `reginfo-index.html`: https://www.reginfo.gov/public/do/eAgendaMain?agencyCd=3170&currentPub=true&operation=OPERATION_GET_AGENCY_RULE_LIST&showStage=active
- `reginfo-rule.html`: https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=3170-AB57&pubId=202510

These are unmodified government HTML responses, used to test parsing against the actual markup. The visible publication label is `2026`; the link's `pubId` is `202510`. Both are preserved rather than assuming they must match. Whitespace checks and automatic formatting are disabled for the raw fixtures.

The live Federal Register RIN lookup returned `{ "description": "Documents associated with RIN 3170-AB57 - ", "count": 0 }`. Test publications in `forecast.test.ts` are synthetic edge cases, not evidence displayed by the app.
