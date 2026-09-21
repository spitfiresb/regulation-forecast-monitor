import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
type Doc = {
  document_number: string;
  title: string;
  publication_date: string;
  regulation_id_numbers: string[];
  html_url: string;
  action?: string;
};
type Example = {
  id: string;
  rin: string;
  title: string;
  cutoff: string;
  end: string;
  agency: string;
  outcome: number;
  source_url: string;
  events: Doc[];
};
const root = ".data/evaluation";
const data = JSON.parse(await readFile(`${root}/examples.json`, "utf8")) as {
  examples: Example[];
};
const docs: Doc[] = [];
for (const file of (await readdir(root)).filter((f) =>
  /^proposals-\d{4}-\d+\.json$/.test(f),
)) {
  const body = JSON.parse(await readFile(`${root}/${file}`, "utf8"));
  docs.push(...body.results);
}
const stop = new Set(
  "the and for with from under rules rule regulations regulation proposed proposal amendments amendment requirements actions action notice federal to of in on a an by".split(
    " ",
  ),
);
const words = (t: string) =>
  new Set(
    (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
      (w) => w.length > 2 && !stop.has(w),
    ),
  );
const indexed = docs.map((d) => ({ d, w: words(d.title) }));
const index = new Map<string, number[]>();
indexed.forEach((item, i) => {
  for (const word of item.w) {
    const list = index.get(word) ?? [];
    list.push(i);
    index.set(word, list);
  }
});
type Candidate = {
  title: string;
  date: string;
  url: string;
  rins: string[];
  score: number;
  before_cutoff: boolean;
};
const findings: {
  id: string;
  rin: string;
  title: string;
  outcome: number;
  candidates: Candidate[];
}[] = [];
for (const e of data.examples) {
  const tokens = words(e.title);
  const ids = new Set<number>();
  for (const word of tokens) for (const i of index.get(word) ?? []) ids.add(i);
  const candidates = [];
  for (const i of ids) {
    const { d, w } = indexed[i];
    if (d.publication_date > e.end || d.regulation_id_numbers?.includes(e.rin))
      continue;
    const common = [...tokens].filter((t) => w.has(t)).length;
    const score = common / Math.max(tokens.size, w.size);
    if (common >= 3 && score >= 0.6)
      candidates.push({
        title: d.title,
        date: d.publication_date,
        url: d.html_url,
        rins: d.regulation_id_numbers,
        score,
        before_cutoff: d.publication_date <= e.cutoff,
      });
  }
  if (candidates.length)
    findings.push({
      id: e.id,
      rin: e.rin,
      title: e.title,
      outcome: e.outcome,
      candidates,
    });
}
const hash = (id: string) => createHash("sha256").update(id).digest("hex");
const sample: Example[] = [];
for (const label of [0, 1]) {
  const candidates = data.examples
    .filter((e) => e.cutoff === "2025-09-22" && e.outcome === label)
    .sort((a, b) => hash(a.id).localeCompare(hash(b.id)));
  const agencies = new Set<string>();
  for (const e of candidates) {
    if (agencies.has(e.agency)) continue;
    sample.push(e);
    agencies.add(e.agency);
    if (sample.filter((x) => x.outcome === label).length === 15) break;
  }
}
const result = {
  created_at: new Date().toISOString(),
  documents_checked: docs.length,
  examples_checked: data.examples.length,
  method:
    "Token overlap across all cached proposed-rule titles, in addition to exact-RIN matching. Candidates require human review and are not automatically reclassified.",
  findings,
  sample: sample.map((e) => ({
    ...e,
    title_candidates: findings.find((f) => f.id === e.id)?.candidates ?? [],
  })),
};
await writeFile(`${root}/audit-findings.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      documents_checked: docs.length,
      examples_checked: data.examples.length,
      flagged: findings.length,
      sample: result.sample.map((e) => ({
        rin: e.rin,
        title: e.title,
        outcome: e.outcome,
        events: e.events.map((d) => ({
          title: d.title,
          date: d.publication_date,
          url: d.html_url,
        })),
        candidates: e.title_candidates,
      })),
    },
    null,
    2,
  ),
);
