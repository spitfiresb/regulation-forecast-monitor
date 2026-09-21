import { test } from "node:test";
import assert from "node:assert/strict";
import baseline from "../data/baseline.json";
import { snapshotSchema, type CatalogEntry } from "../lib/model";
import {
  buildPrediction,
  currentEvaluation,
  estimate,
} from "../lib/prediction/engine";
import { sixMonthsAfter } from "../lib/prediction/model";
import { makeSignal } from "../lib/reginfo";
const snapshot = snapshotSchema.parse(baseline);
const entry: CatalogEntry = {
  ...snapshot.rule,
  agency_code: "3170",
  publication_id: "202510",
  timetable: [{ action: "NPRM", date: "07/00/2026", fr_citation: "" }],
};
const now = "2026-09-21T12:00:00.000Z";
const fresh = () => {
  const s = structuredClone(snapshot);
  s.synced_at = now;
  s.federal_register_checked_at = now;
  return s;
};
test("a catalog listing cannot produce a probability or verified publication claim", () => {
  const f = buildPrediction(entry, null, now);
  assert.equal(f.probability, null);
  assert.equal(f.status, "insufficient_evidence");
  assert.equal(f.facts.length, 0);
});
test("six calendar months preserve month-end precision", () => {
  assert.equal(
    sixMonthsAfter("2026-08-31T12:00:00Z"),
    "2027-02-28T23:59:59.999Z",
  );
  assert.equal(
    sixMonthsAfter("2023-08-31T12:00:00Z"),
    "2024-02-29T23:59:59.999Z",
  );
});
test("a fresh rule uses its own target but cannot bypass a failed evaluation gate", () => {
  const f = buildPrediction(entry, fresh(), now);
  assert.equal(f.target, "NPRM_PUBLISHED");
  assert.equal(f.probability, null);
  assert.equal(f.window_end, "2027-03-21T23:59:59.999Z");
  assert.notEqual(
    f.window_end.slice(0, 7),
    snapshot.forecast.expected_action_date,
  );
});
test("stale and incomplete checks suppress an otherwise enabled model", () => {
  const evaluation = currentEvaluation();
  evaluation.enabled = true;
  evaluation.cohort = { cases: 100, events: 30, k: 30, agencies: {} };
  const s = fresh();
  s.federal_register_checked_at = null;
  assert.equal(buildPrediction(entry, s, now, evaluation).probability, null);
  s.federal_register_checked_at = s.synced_at;
  assert.equal(
    buildPrediction(entry, s, "2026-09-23T12:00:00Z", evaluation).status,
    "stale",
  );
  assert.equal(buildPrediction(entry, s, now, evaluation).probability, 0.3);
});
test("known final publication and ambiguous records are not scored", () => {
  const s = fresh();
  s.signals.push(
    makeSignal(
      "FINAL_RULE_PUBLISHED",
      "Final",
      "Final rule",
      "https://www.federalregister.gov/documents/example",
      now,
      "2026-09-20",
      "day",
    ),
  );
  const f = buildPrediction(entry, s, now);
  assert.equal(f.status, "not_applicable");
  assert.equal(f.target, null);
  s.signals.push(
    makeSignal(
      "REVIEW_REQUIRED",
      "Correction",
      "Correction",
      "https://www.federalregister.gov/documents/correction",
      now,
    ),
  );
  assert.equal(buildPrediction(entry, s, now).status, "review_required");
});
test("evidence cannot cross rule boundaries and forecast issues freeze their window", () => {
  const s = fresh();
  assert.throws(
    () => buildPrediction({ ...entry, id: "another" }, s, now),
    /another rule/,
  );
  const f = buildPrediction(entry, s, now);
  assert.equal(buildPrediction(entry, s, now).id, f.id);
  assert.notEqual(buildPrediction(entry, s, "2026-09-21T13:00:00Z").id, f.id);
  assert.ok(
    f.facts.every((fact) =>
      fact.evidence_ids.every((id) => f.evidence.some((s) => s.id === id)),
    ),
  );
});
test("small agency cohorts fall back to the explicitly pooled rate", () => {
  assert.equal(
    estimate(
      {
        cases: 200,
        events: 40,
        k: 10,
        agencies: { "3170": { cases: 2, events: 2 } },
      },
      "3170",
    ),
    0.2,
  );
  assert.equal(
    estimate(
      {
        cases: 200,
        events: 40,
        k: 10,
        agencies: { "3170": { cases: 40, events: 20 } },
      },
      "3170",
    ),
    0.44,
  );
});

test("resolution preserves the original horizon and does not fabricate negative outcomes", async () => {
  const { resolvePrediction } = await import("../lib/prediction/resolve");
  const s = fresh();
  const issue = buildPrediction(entry, s, now);
  issue.probability = 0.3;
  issue.status = "experimental";
  assert.equal(
    resolvePrediction(issue, s, "2026-10-01T00:00:00Z").outcome,
    "pending",
  );
  assert.equal(
    resolvePrediction(issue, s, "2027-04-01T00:00:00Z").outcome,
    "unresolved",
  );
  s.signals.push(
    makeSignal(
      "NPRM_PUBLISHED",
      "Proposal",
      "Proposal",
      "https://www.federalregister.gov/documents/example",
      now,
      "2027-02-01",
      "day",
    ),
  );
  assert.equal(
    resolvePrediction(issue, s, "2027-02-02T00:00:00Z").outcome,
    "occurred",
  );
  assert.equal(
    resolvePrediction(issue, s, "2026-10-01T00:00:00Z").outcome,
    "pending",
  );
  assert.equal(issue.window_end, "2027-03-21T23:59:59.999Z");
});

test("undated proposals still get a directional outlook, never a fabricated date or probability", () => {
  const s = fresh();
  s.signals = s.signals.filter(
    (signal) => signal.signal_type !== "NPRM_SCHEDULED",
  );
  const issue = buildPrediction({ ...entry, timetable: [] }, s, now);
  assert.equal(issue.outlook?.kind, "inference");
  assert.match(issue.outlook!.headline, /proposal/i);
  assert.match(issue.outlook!.timing, /No agency target/);
  assert.equal(issue.probability, null);
  assert.ok(
    issue.outlook!.evidence_ids.every((id) =>
      s.signals.some((signal) => signal.id === id),
    ),
  );
});
test("missed targets are not rolled forward and incomplete checks do not produce an outlook", () => {
  const s = fresh();
  const issue = buildPrediction(entry, s, now);
  assert.match(issue.outlook!.timing, /target has passed/);
  assert.match(issue.outlook!.timing, /No reliable replacement/);
  s.federal_register_checked_at = null;
  assert.equal(buildPrediction(entry, s, now).outlook?.kind, "abstained");
});
test("directional outlooks can be prospectively tracked without a numerical probability", async () => {
  const { resolvePrediction } = await import("../lib/prediction/resolve");
  const s = fresh();
  const issue = buildPrediction(entry, s, now);
  assert.equal(issue.probability, null);
  assert.equal(
    resolvePrediction(issue, s, "2026-10-01T00:00:00Z").outcome,
    "pending",
  );
  s.signals.push(
    makeSignal(
      "NPRM_PUBLISHED",
      "Proposal",
      "Proposal",
      "https://www.federalregister.gov/documents/example",
      now,
      "2027-02-01",
      "day",
    ),
  );
  assert.equal(
    resolvePrediction(issue, s, "2027-02-02T00:00:00Z").outcome,
    "occurred",
  );
});

test("recovering an agency date alias does not widen the historical model's eligibility", () => {
  const s = fresh();
  const scheduled = s.signals.find(
    (signal) => signal.signal_type === "NPRM_SCHEDULED",
  )!;
  scheduled.raw_wording = scheduled.raw_wording.replace(
    "NPRM",
    "Proposed Rule",
  );
  const evaluation = currentEvaluation();
  evaluation.enabled = true;
  const issue = buildPrediction(entry, s, now, evaluation);
  assert.equal(issue.probability, null);
  assert.match(issue.outlook!.timing, /July 2026/);
});
