import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseCatalog } from "../../lib/catalog";
import { parseAgendaDate } from "../../lib/dates";

type ResearchDocument = {
  document_number: string;
  title: string;
  publication_date: string;
  regulation_id_numbers: string[];
  html_url: string;
  action?: string;
};
type ResearchExample = {
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
  events: ResearchDocument[];
  outcome: number;
  label_status: string;
};
const root = ".data/evaluation";
await mkdir(root, { recursive: true });
const editions = [
  ["202004", "2020-08-26", "2020-16754"],
  ["202104", "2021-07-30", "2021-15272"],
  ["202204", "2022-08-08", "2022-14654"],
  ["202210", "2023-02-22", "2023-02113"],
  ["202404", "2024-08-16", "2024-16445"],
  ["202504", "2025-09-22", "2025-18323"],
];
async function cached(url: string, file: string) {
  try {
    return await readFile(`${root}/${file}`, "utf8");
  } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(60000),
        headers: { "User-Agent": "RegulatoryForecastMonitor research/1.0" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      await writeFile(`${root}/${file}`, text);
      return text;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Fetch failed");
}
// At most two downloads in flight; persisted caches allow interrupted runs to resume.
async function batches<T, U>(items: T[], fn: (item: T) => Promise<U>) {
  const output: U[] = [];
  for (let i = 0; i < items.length; i += 2)
    output.push(...(await Promise.all(items.slice(i, i + 2).map(fn))));
  return output;
}
const archives = await batches(
  editions,
  async ([edition, cutoff, document]) => {
    const source = `https://www.reginfo.gov/public/do/XMLViewFileAction?f=REGINFO_RIN_DATA_${edition}.xml`;
    const text = await cached(source, `${edition}.xml`);
    const intro = JSON.parse(
      await cached(
        `https://www.federalregister.gov/api/v1/documents/${document}.json`,
        `${document}.json`,
      ),
    );
    if (intro.publication_date !== cutoff)
      throw new Error(`Availability date mismatch: ${edition}`);
    // The introduction publication date is a conservative available-by date, not the original online release date.
    const catalog = parseCatalog(text, source, new Date().toISOString());
    console.log(
      `Archive ${edition}: ${catalog.entries.length} records, available by ${cutoff}`,
    );
    return {
      edition,
      cutoff,
      source,
      availability_source: intro.html_url,
      hash: createHash("sha256").update(text).digest("hex"),
      entries: catalog.entries,
    };
  },
);
// Fetch all proposed-rule metadata in bounded annual pages. Historic citations in the agenda also detect earlier proposals.
const years = Array.from({ length: 17 }, (_, i) => 2010 + i);
const documents = (
  await batches(years, async (year) => {
    const docs: ResearchDocument[] = [];
    for (let page = 1; ; page++) {
      const u = new URL(
        "https://www.federalregister.gov/api/v1/documents.json",
      );
      for (const [k, v] of Object.entries({
        "conditions[type][]": "PRORULE",
        "conditions[publication_date][gte]": `${year}-01-01`,
        "conditions[publication_date][lte]": `${year}-12-31`,
        per_page: "1000",
        page: String(page),
        order: "oldest",
      }))
        u.searchParams.set(k, v);
      for (const field of [
        "document_number",
        "title",
        "publication_date",
        "regulation_id_numbers",
        "html_url",
        "action",
      ])
        u.searchParams.append("fields[]", field);
      const body = JSON.parse(
        await cached(u.href, `proposals-${year}-${page}.json`),
      );
      if (!Array.isArray(body.results) || !Number.isInteger(body.count))
        throw new Error(`Incomplete FR response for ${year}`);
      docs.push(...body.results);
      if (!body.next_page_url) {
        if (docs.length !== body.count)
          throw new Error(`Incomplete FR pages for ${year}`);
        break;
      }
    }
    console.log(
      `Federal Register ${year}: ${docs.length} proposed-rule records`,
    );
    return docs;
  })
).flat();
const byRin = new Map<string, ResearchDocument[]>();
for (const doc of documents)
  for (const rin of doc.regulation_id_numbers ?? []) {
    const rows = byRin.get(rin) ?? [];
    rows.push(doc);
    byRin.set(rin, rows);
  }
const examples: ResearchExample[] = [];
const excluded: Record<string, number> = {};
const seen = new Set<string>();
const exclude = (why: string) => {
  excluded[why] = (excluded[why] ?? 0) + 1;
};
const addMonths = (day: string) => {
  const d = new Date(day + "T00:00:00Z");
  const original = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 6);
  d.setUTCDate(
    Math.min(
      original,
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return d.toISOString().slice(0, 10);
};
for (const archive of archives) {
  for (const rule of archive.entries) {
    if (rule.stage !== "Proposed Rule Stage") {
      exclude("not_proposal_stage");
      continue;
    }
    if (seen.has(rule.rin)) {
      exclude("repeat_rin");
      continue;
    }
    // Require a plain planned NPRM. Complex procedures are explicitly outside this first cohort.
    const targets = rule.timetable.filter((t) => /^NPRM$/i.test(t.action));
    if (
      targets.length !== 1 ||
      rule.timetable.some((t) =>
        /interim|direct final|withdraw|supplement|ANPRM|correction/i.test(
          t.action,
        ),
      )
    ) {
      exclude("complex_or_unspecified_procedure");
      continue;
    }
    const scheduled = parseAgendaDate(targets[0].date).date;
    const linked = byRin.get(rule.rin) ?? [];
    if (
      targets[0].fr_citation ||
      linked.some((d) => d.publication_date <= archive.cutoff) ||
      rule.timetable.some(
        (t) => /NPRM|proposed rule/i.test(t.action) && t.fr_citation,
      )
    ) {
      exclude("proposal_already_published");
      continue;
    }
    if (
      /withdraw|resciss|correction|interim final|direct final/i.test(rule.title)
    ) {
      exclude("unsupported_title");
      continue;
    }
    // Timestamp rule: no arbitrary backdated generated predictions are represented here.
    const end = addMonths(archive.cutoff);
    const future = linked.filter(
      (d) => d.publication_date > archive.cutoff && d.publication_date <= end,
    );
    const ambiguous = future.some((d) =>
      /advance|supplement|withdraw|correction|extension|reopen|hearing|meeting|petition|availability/i.test(
        `${d.title} ${d.action ?? ""}`,
      ),
    );
    if (ambiguous) {
      exclude("ambiguous_outcome");
      continue;
    }
    seen.add(rule.rin);
    const outcome = future[0] ?? null;
    examples.push({
      id: `${rule.rin}:${archive.edition}`,
      rin: rule.rin,
      agency: rule.agency_code,
      stage: rule.stage,
      target: "NPRM_PUBLISHED",
      cutoff: archive.cutoff,
      end,
      edition: archive.edition,
      title: rule.title,
      summary: rule.summary,
      scheduled,
      source_url: rule.source_url,
      source_hash: archive.hash,
      availability_source: archive.availability_source,
      events: future,
      outcome: outcome ? 1 : 0,
      label_status: outcome
        ? "rin_matched_candidate"
        : "negative_requires_audit",
    });
  }
}
await writeFile(
  `${root}/examples.json`,
  JSON.stringify(
    {
      created_at: new Date().toISOString(),
      archives: archives.map((a) => ({
        edition: a.edition,
        cutoff: a.cutoff,
        source: a.source,
        availability_source: a.availability_source,
        hash: a.hash,
      })),
      excluded,
      examples,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      examples: examples.length,
      events: examples.filter((x) => x.outcome).length,
      byEdition: Object.fromEntries(
        editions.map(([edition]) => [
          edition,
          {
            n: examples.filter((e) => e.edition === edition).length,
            events: examples.filter((e) => e.edition === edition && e.outcome)
              .length,
          },
        ]),
      ),
      excluded,
    },
    null,
    2,
  ),
);
