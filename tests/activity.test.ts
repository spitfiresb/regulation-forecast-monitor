import { test } from "node:test";
import assert from "node:assert/strict";
import documents from "./fixtures/activity/doe-delay.json";
import {
  activityDocumentSchema,
  activityWindow,
  inWindow,
} from "../lib/activity/model";
import {
  classifyDocument,
  assessStatus,
  sameProceeding,
} from "../lib/activity/analysis";
import { searchActivity, collectRelated } from "../lib/activity/client";
const docs = documents.map((d) => activityDocumentSchema.parse(d));
const now = "2026-09-21T12:00:00Z";
const history = docs.map(classifyDocument);
test("six months is a rolling publication search window, with inclusive boundaries and month-end clamping", () => {
  const window = activityWindow(new Date(now));
  assert.deepEqual(window, { from: "2026-03-21", to: "2026-09-21" });
  assert.equal(inWindow("2026-03-20", window), false);
  assert.equal(inWindow("2026-03-21", window), true);
  assert.equal(inWindow("2026-09-22", window), false);
  assert.equal(
    activityWindow(new Date("2024-08-31T12:00:00Z")).from,
    "2024-02-29",
  );
});
test("DOE regression: six Rule documents contain one original rule and five effective-date delays", () => {
  assert.equal(history.filter((e) => e.kind === "final").length, 1);
  assert.equal(history.filter((e) => e.kind === "delay").length, 5);
  const result = assessStatus(history, true, true, now);
  assert.equal(result.current_status, "Published, but effectiveness delayed");
  assert.equal(result.effective_date, "2026-12-28");
  assert.equal(result.effective_evidence, "2026-13305");
  assert.equal(result.next_status, "Another effective-date delay");
  assert.equal(result.kind, "forecast");
  assert.equal("window_end" in result, false);
  assert.equal("probability" in result, false);
  assert.ok(
    result.evidence.every((id) => docs.some((d) => d.document_number === id)),
  );
  assert.match(result.alternatives.join(" "), /takes effect/);
});
test("older history is retained while only the July update belongs in current search", () => {
  assert.deepEqual(
    docs
      .filter((d) =>
        inWindow(d.publication_date, activityWindow(new Date(now))),
      )
      .map((d) => d.document_number),
    ["2026-13305"],
  );
  assert.ok(docs.some((d) => d.publication_date === "2025-05-16"));
});
test("incomplete or weakly linked history cannot produce a confident next-status prediction", () => {
  assert.equal(
    assessStatus(history, false, true, now).kind,
    "insufficient_evidence",
  );
  assert.equal(
    assessStatus(history, true, false, now).kind,
    "insufficient_evidence",
  );
  assert.equal(
    assessStatus(history, true, true, "2027-01-01T12:00:00Z").kind,
    "insufficient_evidence",
  );
});
test("withdrawal supersedes prior publication; correction and mixed same-day actions require review", () => {
  const withdrawal = {
    ...docs[0],
    document_number: "2026-19999",
    publication_date: "2026-09-01",
    action: "Withdrawal of direct final rule.",
    abstract: "The agency withdraws the direct final rule.",
  };
  const next = assessStatus(
    [classifyDocument(withdrawal), ...history],
    true,
    true,
    now,
  );
  assert.equal(next.current_status, "Withdrawal published");
  assert.equal(next.effective_date, null);
  const correction = {
    ...withdrawal,
    action: "Correction.",
    abstract: "Correcting the dates section.",
  };
  assert.equal(
    assessStatus([classifyDocument(correction), ...history], true, true, now)
      .kind,
    "insufficient_evidence",
  );
  assert.equal(
    assessStatus(
      [classifyDocument(withdrawal), classifyDocument(correction)],
      true,
      true,
      now,
    ).kind,
    "insufficient_evidence",
  );
});
test("comment-period updates are not proposals or new final rules", () => {
  const event = classifyDocument({
    ...docs[0],
    type: "Proposed Rule",
    action: "Proposed rule; extension of comment period.",
    abstract: "The agency extends the public comment period.",
    effective_on: null,
    comments_close_on: "2026-10-01",
  });
  assert.equal(event.kind, "comment_extension");
});
test("a shared RIN alone does not join different dockets", () => {
  assert.equal(
    sameProceeding(docs[0], {
      ...docs[1],
      docket_ids: ["different-proceeding"],
    }),
    false,
  );
  assert.equal(sameProceeding(docs[0], docs[1]), true);
});
test("search sends date bounds to the source and rejects out-of-window returned documents", async () => {
  const original = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (input) => {
    requested = String(input);
    return Response.json({
      count: docs.length,
      results: docs,
      next_page_url: null,
    });
  };
  try {
    const result = await searchActivity("window-regression", 1, new Date(now));
    const url = new URL(requested);
    assert.equal(
      url.searchParams.get("conditions[publication_date][gte]"),
      "2026-03-21",
    );
    assert.equal(
      url.searchParams.get("conditions[publication_date][lte]"),
      "2026-09-21",
    );
    assert.equal(result.entries.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("history lookup has no six-month lower bound and incomplete pagination suppresses completeness", async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return Response.json({
      count: docs.length + 1,
      results: docs,
      next_page_url: null,
    });
  };
  try {
    const result = await collectRelated(docs[0], "2026-09-21");
    assert.equal(result.complete, false);
    assert.equal(result.documents.length, 6);
    assert.equal(
      new URL(requested[0]).searchParams.has(
        "conditions[publication_date][gte]",
      ),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("requests for information are not substantive proposals even when the API labels them Proposed Rule", () => {
  const event = classifyDocument({
    ...docs[0],
    type: "Proposed Rule",
    title: "Request for Information Regarding Mortgage Credit",
    action: "Request for information.",
    abstract: "The agency requests information.",
    effective_on: null,
  });
  assert.equal(event.kind, "prerule");
  assert.equal(
    assessStatus([event], true, true, now).current_status,
    "Pre-rule information gathering",
  );
  assert.equal(history.at(-1)?.kind, "final");
});

test("unlinked later publications block a status forecast; older unrelated dockets are disclosed as excluded context", async () => {
  const original = globalThis.fetch;
  const other = {
    ...docs[1],
    docket_ids: ["unrelated-docket"],
    document_number: "2026-19998",
    publication_date: "2026-03-01",
  };
  globalThis.fetch = async () =>
    Response.json({ count: 2, results: [docs[0], other], next_page_url: null });
  try {
    const earlier = await collectRelated(docs[0], "2026-09-21");
    assert.equal(earlier.complete, true);
    assert.equal(earlier.excluded, 1);
    other.publication_date = "2026-08-01";
    assert.equal((await collectRelated(docs[0], "2026-09-21")).complete, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("browse filters reach Federal Register and remain distinct in the search cache", async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    urls.push(new URL(String(input)));
    return Response.json({ count: 0, results: [], next_page_url: null });
  });
  const rules = await searchActivity("", 1, new Date(now), {
    agency: "136",
    type: "RULE",
  });
  await searchActivity("", 1, new Date(now), {
    agency: "136",
    type: "PRORULE",
  });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get("conditions[agency_ids][]"), "136");
  assert.deepEqual(urls[0].searchParams.getAll("conditions[type][]"), ["RULE"]);
  assert.deepEqual(urls[1].searchParams.getAll("conditions[type][]"), [
    "PRORULE",
  ]);
  assert.equal(rules.agency, "136");
  assert.equal(rules.publication_type, "RULE");
});
