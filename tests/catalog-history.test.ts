import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "../data/baseline.json";
import { snapshotSchema, type Snapshot } from "../lib/model";
import { historyCutoff, snapshotFingerprint } from "../lib/history";
import {
  discoverCatalogUrl,
  parseCatalog,
  saveCatalog,
  searchCatalog,
} from "../lib/catalog";
import {
  getSnapshot,
  getHistory,
  getDashboard,
  saveSnapshot,
  pruneHistory,
} from "../lib/repository";
import { parseReginfo } from "../lib/reginfo";
import { normalizeFederalRegister } from "../lib/federal-register";
import { collectSnapshot } from "../lib/sync";

const source =
  "https://www.reginfo.gov/public/do/XMLViewFileAction?f=REGINFO_RIN_DATA_202510.xml";
const xml = `<REGINFO_RIN_DATA><RIN_INFO>
<RIN>2040-AA01</RIN><PUBLICATION><PUBLICATION_ID>202510</PUBLICATION_ID></PUBLICATION>
<AGENCY><CODE>2040</CODE><NAME>Water Office</NAME></AGENCY><PARENT_AGENCY><NAME>Test Agency</NAME></PARENT_AGENCY>
<RULE_TITLE>Water quality</RULE_TITLE><ABSTRACT>&lt;p&gt;Considering a change.&lt;/p&gt;</ABSTRACT>
<RULE_STAGE>Proposed Rule Stage</RULE_STAGE><CFR_LIST><CFR>40 CFR Part 1</CFR><CFR>40 CFR Part 2</CFR></CFR_LIST>
<TIMETABLE_LIST><TIMETABLE><TTBL_ACTION>NPRM</TTBL_ACTION><TTBL_DATE>07/00/2026</TTBL_DATE><FR_CITATION>90 FR 123</FR_CITATION></TIMETABLE></TIMETABLE_LIST>
<AGENCY_CONTACT_LIST><CONTACT><AGENCY><CODE>9999</CODE><NAME>Wrong contact agency</NAME></AGENCY></CONTACT></AGENCY_CONTACT_LIST>
</RIN_INFO></REGINFO_RIN_DATA>`;
function otherRule(snapshot: Snapshot): Snapshot {
  const value = structuredClone(snapshot);
  value.rule.id = "2040-aa01";
  value.rule.rin = "2040-AA01";
  value.forecast.id = "forecast-2040-aa01";
  value.forecast.rule_id = value.rule.id;
  value.signals.forEach((s) => {
    s.rule_id = value.rule.id;
  });
  return value;
}

test("six calendar months clamp correctly at month-end and preserve UTC time", () => {
  assert.equal(
    historyCutoff(new Date("2026-08-31T12:34:56.000Z")),
    "2026-02-28T12:34:56.000Z",
  );
  assert.equal(
    historyCutoff(new Date("2024-08-31T12:34:56.000Z")),
    "2024-02-29T12:34:56.000Z",
  );
  assert.equal(
    historyCutoff(new Date("2026-01-15T00:00:00.000Z")),
    "2025-07-15T00:00:00.000Z",
  );
});

test("catalog discovery only accepts official XML URLs and selects the newest edition", () => {
  assert.equal(
    discoverCatalogUrl(
      `<a href="https://evil.test/public/do/XMLViewFileAction?f=REGINFO_RIN_DATA_209901.xml">bad</a><a href="/public/do/XMLViewFileAction?f=REGINFO_RIN_DATA_202504.xml">old</a><a href="${source}">current</a>`,
    ),
    source,
  );
  assert.throws(() => discoverCatalogUrl("<html>Unavailable</html>"));
});

test("catalog preserves many CFR references and raw timetable precision without inventing forecasts", () => {
  const catalog = parseCatalog(xml, source, new Date().toISOString());
  const entry = catalog.entries[0];
  assert.equal(entry.agency_code, "2040");
  assert.equal(entry.agency, "Test Agency / Water Office");
  assert.equal(entry.summary, "Considering a change.");
  assert.deepEqual(entry.cfr_citation, ["40 CFR 1", "40 CFR 2"]);
  assert.equal(entry.timetable[0].date, "07/00/2026");
  assert.equal(entry.timetable[0].fr_citation, "90 FR 123");
  assert.equal("forecast" in entry, false);
  assert.throws(() =>
    parseCatalog("<html>Unavailable</html>", source, new Date().toISOString()),
  );
});

test("general parsers accept another RIN and CFR part, with independent signal identities", async () => {
  const html = readFileSync(
    new URL("./fixtures/reginfo-rule.html", import.meta.url),
    "utf8",
  )
    .replaceAll("3170-AB57", "2040-AA01")
    .replaceAll("12 CFR 1026", "40 CFR 1");
  const target = { id: "2040-aa01", rin: "2040-AA01", agency_code: "2040" };
  const parsed = parseReginfo(
    html,
    "https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=2040-AA01&pubId=202510",
    new Date().toISOString(),
    target,
  );
  assert.equal(parsed.rule.rin, target.rin);
  assert.ok(parsed.signals.every((s) => s.rule_id === target.id));
  const register = normalizeFederalRegister(
    [],
    "2026-09-21T00:00:00.000Z",
    target,
  );
  const nextDay = normalizeFederalRegister(
    [],
    "2026-09-22T00:00:00.000Z",
    target,
  );
  assert.equal(register[0].id, nextDay[0].id);
  assert.match(register[0].source_url, /2040-AA01/);
  assert.notEqual(
    register[0].id,
    normalizeFederalRegister([], "2026-09-21T00:00:00.000Z")[0].id,
  );
  await assert.rejects(
    collectSnapshot(snapshotSchema.parse(baseline), target),
    /another rule/,
  );
});

test("snapshot validation rejects cross-rule records and dangling evidence", () => {
  const bad = snapshotSchema.parse(baseline);
  bad.signals[0].rule_id = "unrelated";
  assert.equal(snapshotSchema.safeParse(bad).success, false);
  bad.signals[0].rule_id = bad.rule.id;
  bad.forecast.evidence.change.push("missing-signal");
  assert.equal(snapshotSchema.safeParse(bad).success, false);
});

test("local storage isolates rules, saves changes only, prunes history, and keeps latest state", async () => {
  const env = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), "forecast-history-"));
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VERCEL",
    "CF_PAGES",
  ])
    delete process.env[name];
  process.env.LOCAL_DATA_DIR = dir;
  try {
    const first = snapshotSchema.parse(baseline);
    first.synced_at = new Date(Date.now() - 5000).toISOString();
    await saveSnapshot(first);
    const next = structuredClone(first);
    next.synced_at = new Date(Date.now() - 4000).toISOString();
    next.forecast.updated_at = next.synced_at;
    next.signals.forEach((s) => {
      s.observed_at = next.synced_at;
    });
    next.signals.find((s) => s.signal_type === "FR_CHECK")!.date = "2026-09-22";
    next.forecast.reasoning.push("Different retrieval date");
    assert.equal(snapshotFingerprint(first), snapshotFingerprint(next));
    await saveSnapshot(next);
    assert.equal((await getHistory(first.rule.id)).length, 1);
    assert.equal((await getSnapshot(first.rule.id))?.synced_at, next.synced_at);
    const changed = structuredClone(next);
    changed.rule.summary = "Changed source abstract";
    changed.synced_at = new Date(Date.now() - 3000).toISOString();
    await saveSnapshot(changed);
    assert.equal((await getHistory(first.rule.id)).length, 2);
    await saveSnapshot(otherRule(changed));
    assert.equal((await getDashboard("2040-aa01")).rule.rin, "2040-AA01");
    assert.equal((await getDashboard()).rule.rin, "3170-AB57");
    await assert.rejects(saveSnapshot(first), /newer refresh/);
    await assert.rejects(getDashboard("untracked"), /No verified snapshot/);
    assert.equal(await getSnapshot("untracked"), null);
    const expired = structuredClone(changed);
    expired.synced_at = "2020-01-01T00:00:00.000Z";
    await writeFile(
      join(dir, "rules", `${changed.rule.id}.json`),
      JSON.stringify({ latest: changed, history: [expired, first, changed] }),
    );
    await pruneHistory();
    assert.equal((await getHistory(changed.rule.id)).length, 2);
    assert.equal(
      (await getSnapshot(changed.rule.id))?.synced_at,
      changed.synced_at,
    );
    // Legacy local files remain readable for the original rule only.
    await rm(join(dir, "rules", `${changed.rule.id}.json`));
    await writeFile(join(dir, "latest.json"), JSON.stringify(first));
    assert.equal(
      (await getSnapshot(first.rule.id))?.synced_at,
      first.synced_at,
    );

    const catalog = parseCatalog(xml, source, new Date().toISOString());
    await saveCatalog(catalog);
    assert.equal(
      (await searchCatalog({ q: "water", agency: "2040" })).total,
      1,
    );
    assert.equal((await searchCatalog({ q: "40 CFR 2" })).total, 1);
    assert.equal((await searchCatalog({ category: "environment" })).total, 1);
    assert.equal((await searchCatalog({ category: "finance" })).total, 0);
    await assert.rejects(searchCatalog({ category: "nonexistent" }));
    assert.equal((await searchCatalog({ agency: "3170" })).total, 0);
    assert.equal((await searchCatalog({ offset: 1 })).entries.length, 0);
    await assert.rejects(
      saveCatalog({
        ...catalog,
        publication_id: "202504",
        entries: catalog.entries.map((e) => ({
          ...e,
          publication_id: "202504",
        })),
      }),
      /Stale catalog/,
    );
    assert.equal((await searchCatalog()).metadata?.publication_id, "202510");
  } finally {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  }
});
