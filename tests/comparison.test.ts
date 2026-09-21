import { test } from "node:test";
import assert from "node:assert/strict";
import baseline from "../data/baseline.json";
import { snapshotSchema } from "../lib/model";
import { compareSnapshots } from "../lib/comparison";
import { currentBrief, reviewedContext } from "../lib/brief";
import { makeSignal } from "../lib/reginfo";

const previous = snapshotSchema.parse(baseline);
const next = () => {
  const data = structuredClone(previous);
  data.synced_at = "2026-09-22T12:00:00.000Z";
  data.federal_register_checked_at = data.synced_at;
  return data;
};

test("refresh timestamps and rewritten AI summaries are not regulatory changes", () => {
  const data = next();
  data.forecast.expected_change = "Different phrasing of the same abstract";
  data.signals.forEach((s) => {
    s.observed_at = data.synced_at;
    if (s.signal_type === "FR_CHECK") s.date = "2026-09-22";
  });
  assert.deepEqual(compareSnapshots(data, previous)?.changes, []);
  assert.equal(compareSnapshots(data), null);
});

test("agenda target revisions and removed targets are shown without invented dates", () => {
  const data = next();
  data.signals.find((s) => s.signal_type === "NPRM_SCHEDULED")!.date =
    "2026-11";
  const change = compareSnapshots(data, previous)!.changes[0];
  assert.equal(change.before, "July 2026");
  assert.equal(change.after, "November 2026");
  data.signals = data.signals.filter((s) => s.signal_type !== "NPRM_SCHEDULED");
  assert.equal(
    compareSnapshots(data, previous)!.changes[0].after,
    "Not listed",
  );
});

test("new publication is linked, but failed checks never imply its removal", () => {
  const data = next();
  const publication = makeSignal(
    "NPRM_PUBLISHED",
    "Proposal",
    "Official proposal wording",
    "https://www.federalregister.gov/documents/example",
    data.synced_at,
    "2026-09-22",
    "day",
    "Federal Register",
  );
  data.signals.push(publication);
  assert.equal(
    compareSnapshots(data, previous)!.changes[0].source_url,
    publication.source_url,
  );
  const failed = next();
  failed.federal_register_checked_at = previous.federal_register_checked_at;
  assert.equal(compareSnapshots(failed, data)!.incomplete, true);
  assert.deepEqual(compareSnapshots(failed, data)!.changes, []);
});

test("elapsed target summary preserves search scope and cannot imply no publication after one is found", () => {
  const data = next();
  assert.match(
    currentBrief(data, Date.parse(data.synced_at)),
    /target has passed/,
  );
  assert.match(currentBrief(data, Date.parse(data.synced_at)), /exact-RIN/);
  data.signals = data.signals.filter((s) => s.signal_type !== "FR_CHECK");
  assert.match(
    currentBrief(data, Date.parse(data.synced_at)),
    /has not been verified/,
  );
  data.signals.push(
    makeSignal(
      "NPRM_PUBLISHED",
      "Proposal",
      "Proposal",
      "https://www.federalregister.gov/documents/example",
      data.synced_at,
    ),
  );
  assert.doesNotMatch(
    currentBrief(data, Date.parse(data.synced_at)),
    /No matching|target has passed/,
  );
});

test("a changed abstract cannot inherit the old reviewed impact explanation", () => {
  const data = next();
  assert.ok(reviewedContext(data));
  data.rule.summary = "A revised approach with a different scope.";
  assert.equal(reviewedContext(data), null);
});
