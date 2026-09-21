import { test } from "node:test";
import assert from "node:assert/strict";
import baseline from "../data/baseline.json";
import { snapshotSchema, type Signal, type SignalType } from "../lib/model";
import { buildForecast } from "../lib/forecast";
import { makeSignal } from "../lib/reginfo";
import {
  normalizeFederalRegister,
  type FRDocument,
} from "../lib/federal-register";

const data = snapshotSchema.parse(baseline);
const now = "2026-09-21T12:00:00.000Z";
const s = (type: SignalType, date: string | null = null) =>
  makeSignal(
    type,
    type,
    type,
    data.rule.source_url,
    now,
    date,
    date ? "day" : "unknown",
  );
const forecast = (signals: Signal[]) => buildForecast(data.rule, signals, now);
test("the verified baseline is developing, with a month-only NPRM target and unknown final/effective dates", () => {
  const f = forecast(data.signals);
  assert.equal(f.likelihood, "DEVELOPING");
  assert.equal(f.expected_action_date, "2026-07");
  assert.equal(f.effective_date, null);
  assert.equal(f.final_rule_date, null);
  assert.equal(f.confidence, "Medium");
});
test("deterministic stage precedence", () => {
  const cases: [SignalType[], string][] = [
    [["AGENDA_LISTED"], "EARLY"],
    [["PROPOSED_RULE_STAGE"], "DEVELOPING"],
    [["PROPOSED_RULE_STAGE", "NPRM_PUBLISHED"], "STRONG"],
    [["NPRM_PUBLISHED", "COMMENT_PERIOD_CLOSED"], "HIGH SIGNAL"],
    [
      ["NPRM_PUBLISHED", "COMMENT_PERIOD_CLOSED", "FINAL_RULE_STAGE"],
      "VERY HIGH SIGNAL",
    ],
    [["FINAL_RULE_STAGE", "FINAL_RULE_PUBLISHED"], "FINALIZED"],
    [["FINAL_RULE_PUBLISHED", "REVIEW_REQUIRED"], "REVIEW REQUIRED"],
  ];
  for (const [types, expected] of cases)
    assert.equal(forecast(types.map((t) => s(t))).likelihood, expected);
});
test("absence is never inferred from a missing publication check", () => {
  assert.match(
    forecast([s("PROPOSED_RULE_STAGE")]).reasoning.join(" "),
    /not been verified/,
  );
});
test("an open supplemental comment window takes precedence over an older closed window", () => {
  const f = forecast([
    s("NPRM_PUBLISHED", "2026-09-01"),
    s("COMMENT_PERIOD_CLOSED", "2026-08-01"),
    s("COMMENT_PERIOD_OPEN", "2026-10-01"),
  ]);
  assert.equal(f.likelihood, "STRONG");
  assert.equal(f.expected_action_date, "2026-10-01");
});
test("an effective date cannot be inferred without its published final rule", () => {
  assert.equal(
    forecast([s("EFFECTIVE_DATE", "2026-11-01")]).effective_date,
    null,
  );
  assert.equal(
    forecast([
      s("FINAL_RULE_PUBLISHED", "2026-09-01"),
      s("EFFECTIVE_DATE", "2026-11-01"),
    ]).effective_date,
    "2026-11-01",
  );
});
test("later proposals and multiple final publications pause the simple forecast", () => {
  assert.equal(
    forecast([
      s("FINAL_RULE_PUBLISHED", "2026-08-01"),
      s("NPRM_PUBLISHED", "2026-09-01"),
    ]).likelihood,
    "REVIEW REQUIRED",
  );
  assert.equal(
    forecast([
      s("FINAL_RULE_PUBLISHED", "2026-08-01"),
      s("FINAL_RULE_PUBLISHED", "2026-09-01"),
    ]).effective_date,
    null,
  );
});
test("every forecast evidence reference resolves to a real signal", () => {
  const f = forecast(data.signals);
  for (const ids of Object.values(f.evidence)) {
    assert.ok(ids.length > 0);
    for (const id of ids) assert.ok(data.signals.find((s) => s.id === id));
  }
});
const document: FRDocument = {
  document_number: "2026-12345",
  title: "Contingency Calculations for Determining Average Prime Offer Rate",
  type: "Proposed Rule",
  html_url:
    "https://www.federalregister.gov/documents/2026/09/01/2026-12345/apor",
  publication_date: "2026-09-01",
  regulation_id_numbers: ["3170-AB57"],
  comments_close_on: "2026-09-21",
};
test("comment period remains open through its published closing day", () => {
  assert.ok(
    normalizeFederalRegister([document], now).some(
      (s) => s.signal_type === "COMMENT_PERIOD_OPEN",
    ),
  );
  assert.ok(
    normalizeFederalRegister([document], "2026-09-22T00:00:00.000Z").some(
      (s) => s.signal_type === "COMMENT_PERIOD_CLOSED",
    ),
  );
});
test("future and unrelated documents do not become publication evidence", () => {
  const signals = normalizeFederalRegister(
    [
      { ...document, publication_date: "2026-12-01" },
      { ...document, regulation_id_numbers: ["other"] },
    ],
    now,
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, "FR_CHECK");
});
test("withdrawals and corrections require review instead of increasing likelihood", () => {
  for (const title of [
    "Withdrawal of proposed rule",
    "Final rule; correction",
    "Delay of effective date",
  ]) {
    const signals = normalizeFederalRegister([{ ...document, title }], now);
    assert.equal(forecast(signals).likelihood, "REVIEW REQUIRED");
  }
});
