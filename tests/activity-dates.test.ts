import { test } from "node:test";
import assert from "node:assert/strict";
import documents from "./fixtures/activity/doe-delay.json";
import { activityDocumentSchema } from "../lib/activity/model";
import {
  assessStatus,
  classifyDocument,
  publishedEffectiveDate,
} from "../lib/activity/analysis";
const history = documents.map((d) =>
  classifyDocument(activityDocumentSchema.parse(d)),
);
const now = "2026-09-21T12:00:00Z";

test("an explicit new date in DATES supersedes conflicting metadata without changing the source", () => {
  const event = {
    ...history[0],
    document: { ...history[0].document, effective_on: "2025-05-16" },
  };
  const result = assessStatus([event, ...history.slice(1)], true, true, now);
  assert.equal(result.effective_date, "2026-12-28");
  assert.equal(result.current_status, "Published, but effectiveness delayed");
  assert.match(result.effective_date_note ?? "", /conflicts/);
  assert.equal(event.document.effective_on, "2025-05-16");
});

test("ambiguous DATES changes withhold the date, and historical recitals do not override metadata", () => {
  const event = {
    ...history[0],
    document: {
      ...history[0].document,
      dates:
        "The date is delayed until December 24, 2026. Another date is delayed until December 28, 2026.",
    },
  };
  assert.equal(publishedEffectiveDate(event).date, null);
  event.document.dates = "The date was delayed until December 24, 2026.";
  assert.equal(publishedEffectiveDate(event).date, event.document.effective_on);
  event.document.dates = "The date is delayed until February 30, 2027.";
  assert.equal(publishedEffectiveDate(event).date, null);
});
