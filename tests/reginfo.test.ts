import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoverRuleUrl, parseReginfo } from "../lib/reginfo";
import { frSearchSchema } from "../lib/federal-register";
import { formatDate, parseAgendaDate, targetElapsed } from "../lib/dates";

const index = readFileSync(
  new URL("./fixtures/reginfo-index.html", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("./fixtures/reginfo-rule.html", import.meta.url),
  "utf8",
);
const now = "2026-09-21T12:00:00.000Z";
const url = discoverRuleUrl(index);
test("discovers the live publication link instead of pinning a historical agenda", () => {
  assert.match(url, /pubId=202510/);
  assert.match(
    discoverRuleUrl(index.replaceAll("202510", "202610")),
    /pubId=202610/,
  );
  assert.throws(() =>
    discoverRuleUrl("<a href='https://evil.example/?RIN=3170-AB57'>record</a>"),
  );
});
test("extracts real Reginfo HTML including nested abstract markup and both affected CFR parts", () => {
  const { rule, signals } = parseReginfo(html, url, now);
  assert.equal(rule.stage, "Proposed Rule Stage");
  assert.equal(rule.legal_deadline, "None");
  assert.deepEqual(rule.cfr_citation, ["12 CFR 1003", "12 CFR 1026"]);
  assert.match(
    rule.summary,
    /considering authorizing the use of contingency calculations/,
  );
  assert.equal(
    signals.find((s) => s.signal_type === "NPRM_SCHEDULED")?.date,
    "2026-07",
  );
});
test("rejects source drift and the wrong RIN instead of inventing defaults", () => {
  assert.throws(() =>
    parseReginfo(html.replaceAll("3170-AB57", "3170-OTHER"), url, now),
  );
  assert.throws(() =>
    parseReginfo(
      html.replace("<b>Abstract:</b>", "<b>Changed Field:</b>"),
      url,
      now,
    ),
  );
});
test("repeated observations have stable signal IDs", () => {
  const a = parseReginfo(html, url, now).signals;
  const b = parseReginfo(html, url, "2026-09-22T12:00:00.000Z").signals;
  assert.deepEqual(
    a.map((x) => x.id),
    b.map((x) => x.id),
  );
});
test("dates preserve precision and reject invalid dates", () => {
  assert.deepEqual(parseAgendaDate("07/00/2026"), {
    date: "2026-07",
    precision: "month",
  });
  assert.deepEqual(parseAgendaDate("07/15/2026"), {
    date: "2026-07-15",
    precision: "day",
  });
  for (const date of ["TBD", "00/00/2026", "02/31/2026", "13/01/2026"])
    assert.equal(parseAgendaDate(date).date, null);
  assert.equal(formatDate("2026-07"), "July 2026");
  assert.equal(formatDate(null), "Unknown");
  assert.equal(targetElapsed("2026-07", new Date("2026-07-31")), false);
  assert.equal(targetElapsed("2026-07", new Date("2026-08-01")), true);
});
test("Federal Register count-only empty responses are valid, partial pagination is rejected", () => {
  assert.deepEqual(frSearchSchema.parse({ count: 0 }).results, []);
  assert.throws(() =>
    frSearchSchema.parse({ count: 2, results: [{ document_number: "one" }] }),
  );
  assert.throws(() =>
    frSearchSchema.parse({ count: 0, next_page_url: "https://example.com" }),
  );
});
