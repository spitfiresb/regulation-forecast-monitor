import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { type Evaluation } from "../../lib/prediction/model";
type Example = {
  id: string;
  rin: string;
  agency: string;
  stage: string;
  target: string;
  cutoff: string;
  end: string;
  edition: string;
  title: string;
  summary: string;
  scheduled: string | null;
  source_url: string;
  source_hash: string;
  availability_source: string;
  events: {
    title: string;
    html_url: string;
    document_number: string;
    publication_date: string;
    action?: string;
  }[];
  outcome: number;
  label_status: string;
};
const dataset = JSON.parse(
  await readFile(".data/evaluation/examples.json", "utf8"),
) as {
  examples: Example[];
  archives: {
    edition: string;
    source: string;
    availability_source: string;
    hash: string;
  }[];
};
const all = dataset.examples;
const train = all.filter((x) => x.edition <= "202204");
const dev = all.filter((x) => ["202210", "202404"].includes(x.edition));
const test = all.filter((x) => x.edition === "202504");
const counts = (rows: Example[]) => {
  const agencies: Evaluation["cohort"]["agencies"] = {};
  for (const x of rows) {
    const a = agencies[x.agency] ?? { events: 0, cases: 0 };
    a.cases++;
    a.events += x.outcome;
    agencies[x.agency] = a;
  }
  return {
    cases: rows.length,
    events: rows.reduce((n, x) => n + x.outcome, 0),
    agencies,
    k: 30,
  };
};
const probability = (cohort: Evaluation["cohort"], agency: string) => {
  const p = cohort.events / cohort.cases;
  const a = cohort.agencies[agency];
  return a && a.cases >= 30
    ? (a.events + cohort.k * p) / (a.cases + cohort.k)
    : p;
};
const brier = (rows: Example[], c: Evaluation["cohort"], baseline = false) =>
  rows.reduce(
    (sum, x) =>
      sum +
      ((baseline ? c.events / c.cases : probability(c, x.agency)) -
        x.outcome) **
        2,
    0,
  ) / rows.length;
const scores = [10, 30, 100, 300]
  .map((k) => {
    const cohort = { ...counts(train), k };
    return { k, brier: brier(dev, cohort) };
  })
  .sort((a, b) => a.brier - b.brier);
// All refit labels mature before the final test cutoff; the holdout chooses no parameters.
const refit = [...train, ...dev];
const cohort = { ...counts(refit), k: scores[0].k };
if (refit.some((x) => x.end >= test[0].cutoff))
  throw new Error("Training outcome overlaps test origin");
const modelBrier = brier(test, cohort);
const baseline = brier(test, cohort, true);
const calibration = [0, 0.1, 0.2, 0.3, 0.5, 1.01]
  .slice(0, -1)
  .map((lo, i) => {
    const hi = [0.1, 0.2, 0.3, 0.5, 1.01][i];
    const rows = test.filter((x) => {
      const p = probability(cohort, x.agency);
      return p >= lo && p < hi;
    });
    return {
      mean_prediction: rows.length
        ? rows.reduce((n, x) => n + probability(cohort, x.agency), 0) /
          rows.length
        : 0,
      event_rate: rows.length
        ? rows.reduce((n, x) => n + x.outcome, 0) / rows.length
        : 0,
      count: rows.length,
    };
  })
  .filter((x) => x.count);
const reasons: string[] = [];
if (
  test.length < 100 ||
  test.filter((x) => x.outcome).length < 20 ||
  test.filter((x) => !x.outcome).length < 20
)
  reasons.push("The temporal holdout is too small.");
if (modelBrier > baseline)
  reasons.push(
    "The agency model did not improve on the pooled stage baseline.",
  );
if (
  calibration.some(
    (x) => x.count >= 30 && Math.abs(x.mean_prediction - x.event_rate) > 0.15,
  )
)
  reasons.push(
    "A supported calibration band misses its observed rate by more than 15 percentage points.",
  );
// Publication matching must be audited independently; metrics cannot certify their own labels.
reasons.push(
  "The publication-matching audit found a false negative caused by mismatched RIN metadata. Outcome labels need correction and review before a chance can be estimated.",
);
const evaluatedAt = new Date().toISOString();
const version = `nprm-cohort-${createHash("sha256")
  .update(
    JSON.stringify({ evaluatedAt, archives: dataset.archives, scores, cohort }),
  )
  .digest("hex")
  .slice(0, 12)}`;
const report: Evaluation = {
  version,
  created_at: evaluatedAt,
  status: "preliminary",
  target: "NPRM_PUBLISHED",
  method: "Agency-and-stage historical cohort, smoothed toward the stage rate",
  enabled: false,
  reasons,
  counts: {
    training: train.length,
    development: dev.length,
    test: test.length,
    test_events: test.filter((x) => x.outcome).length,
    unresolved: all.length,
  },
  metrics: { brier: modelBrier, baseline_brier: baseline, calibration },
  cohort,
  periods: {
    training_end: refit
      .map((x) => x.end)
      .sort()
      .at(-1)!,
    test_start: test[0].cutoff,
    test_end: test[0].end,
  },
  sources: dataset.archives.map((x) => ({
    url: x.source,
    label: `Agenda ${x.edition}`,
  })),
  limitations: [
    "These are preliminary retrospective results using candidate publication labels, not validated live performance.",
    "Archived edition availability uses the later Federal Register introduction date; it does not claim the earliest online release date.",
    "Exact-RIN matching may miss publications with absent or incorrect RIN metadata.",
    "One origin per RIN avoids repeated versions masquerading as independent examples.",
    "Older agency behavior may not transfer to the current administration.",
  ],
};
await mkdir("data/evaluation", { recursive: true });
await writeFile(
  "data/evaluation/current.json",
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  `.data/evaluation/${version}.json`,
  JSON.stringify(
    {
      report,
      scores,
      train: train.map((x) => x.id),
      development: dev.map((x) => x.id),
      test: test.map((x) => ({
        id: x.id,
        p: probability(cohort, x.agency),
        y: x.outcome,
      })),
      examples: all,
    },
    null,
    2,
  ),
);
const audit = [
  ...test.filter((x) => x.outcome).slice(0, 15),
  ...test.filter((x) => !x.outcome).slice(0, 15),
];
await writeFile(
  ".data/evaluation/audit-sample.json",
  JSON.stringify(audit, null, 2),
);
console.log(
  JSON.stringify(
    {
      version,
      counts: report.counts,
      scores,
      metrics: report.metrics,
      reasons,
    },
    null,
    2,
  ),
);
