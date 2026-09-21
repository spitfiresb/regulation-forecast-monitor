import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { curatedExamples } from "../lib/activity/examples";
import {
  activityDocumentSchema,
  type ActivityCase,
} from "../lib/activity/model";
import { forecastEnd } from "../lib/activity/forecast-contract";

const directory = new URL("../public/examples/", import.meta.url);

test("curated links have complete, unchanged reviewed AI snapshots", async () => {
  assert.ok(curatedExamples.length >= 5 && curatedExamples.length <= 10);
  assert.equal(
    new Set(curatedExamples.map((e) => e.id)).size,
    curatedExamples.length,
  );
  assert.deepEqual(
    (await readdir(directory)).sort(),
    curatedExamples.map((e) => `${e.id}.json`).sort(),
  );
  for (const example of curatedExamples) {
    const record: ActivityCase = JSON.parse(
      await readFile(new URL(`${example.id}.json`, directory), "utf8"),
    );
    assert.equal(record.id, example.id);
    assert.equal(record.selected.document_number, example.id);
    activityDocumentSchema.parse(record.selected);
    assert.equal(record.history_complete, true);
    assert.equal(record.assessment.ai?.status, "generated");
    assert.equal(record.assessment.ai?.review?.approved, true);
    assert.ok(record.assessment.basis.length >= 2);
    assert.ok(
      record.assessment.ai?.research?.sources.some((s) => s.full_text_read),
    );
    const known = new Set(
      record.assessment.ai?.research?.sources.map((s) => s.id),
    );
    for (const id of record.assessment.evidence)
      assert.ok(known.has(id), `${example.id}: missing cited source ${id}`);
    const prediction = record.assessment.ai?.prediction;
    if (prediction) {
      assert.equal(record.assessment.kind, "forecast");
      assert.equal(
        prediction.window_end,
        forecastEnd(prediction.issued_at, prediction.horizon_days),
      );
    } else {
      assert.equal(record.assessment.kind, "insufficient_evidence");
      assert.match(example.description, /cannot yet support a prediction/);
    }
    const {
      id,
      selected,
      history,
      related_excluded,
      history_complete,
      linkage,
      limitations,
      assessment,
      summary,
    } = record;
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          id,
          selected,
          history,
          related_excluded,
          history_complete,
          linkage,
          limitations,
          assessment,
          summary,
        }),
      )
      .digest("hex");
    assert.equal(
      record.fingerprint,
      fingerprint,
      `${id}: snapshot differs from the original assessment`,
    );
  }
});
