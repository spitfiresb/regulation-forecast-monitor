import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import documents from "./fixtures/activity/doe-delay.json";
import { activityDocumentSchema } from "../lib/activity/model";
import { classifyDocument, assessStatus } from "../lib/activity/analysis";
import { forecastWithAi } from "../lib/activity/ai";
import {
  forecastEnd,
  resolveForecast,
} from "../lib/activity/forecast-contract";
import { createResearch, excerptFor } from "../lib/activity/research";

const history = documents.map((d) =>
  classifyDocument(activityDocumentSchema.parse(d)),
);
const now = "2026-09-21T12:00:00Z";
const baseline = assessStatus(history, true, true, now);
const latest = history[0].document.document_number;
const cited = (text: string) => ({ text, evidence: [latest] });
const valid = {
  decision: "forecast",
  target_event: "effective_date_delay",
  horizon_days: 180,
  forecast:
    "Another postponement is the leading scenario within 180 days because the agency still has significant adverse comments to resolve.",
  reasons: [
    cited(
      "The latest notice continues the delay while the agency considers comments.",
    ),
    cited(
      "The original direct final route requires resolving significant adverse comments.",
    ),
  ],
  counterargument: cited(
    "The agency could finish its review and allow the current effective date to stand.",
  ),
  alternatives: [
    {
      event: "no_new_publication",
      explanation:
        "The agency could complete its review without another publication.",
    },
  ],
  horizon_basis: cited(
    "The 180-day window covers the published effective date and time for another notice.",
  ),
  watch_for: [
    "A notice resolving adverse comments would weaken the delay forecast.",
  ],
  missing_evidence: [],
};
const action = (tool: string, id = "", query = "") => ({
  tool,
  document_number: id,
  query,
  purpose: "Inspect evidence relevant to the future publication event.",
});
const firstPlan = {
  actions: [
    action("read_publication", latest, "adverse comments"),
    action("find_comparables", "", "direct final adverse comments"),
  ],
  ready: true,
};
function setup(t: TestContext, output: unknown = valid, approved = true) {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      const address = String(url);
      if (address.includes("generativelanguage")) {
        const request = JSON.parse(String(init?.body));
        assert.ok(request.generationConfig.responseJsonSchema);
        const input = JSON.parse(request.contents[0].parts[0].text);
        calls++;
        if (calls === 1) {
          assert.equal(input.current_status, baseline.current_status);
          assert.equal("next_status" in input, false);
        }
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify(
                      calls === 1
                        ? firstPlan
                        : calls === 2
                          ? output
                          : {
                              approved,
                              problems: approved
                                ? []
                                : ["This is only a current-stage summary."],
                            },
                    ),
                  },
                ],
              },
            },
          ],
        });
      }
      if (address.includes("/full_text/text/"))
        return new Response(
          "Official notice: the agency is reviewing significant adverse comments before this direct final rule can take effect. ".repeat(
            4,
          ),
        );
      if (address.includes(`/documents/${latest}.json`))
        return Response.json({
          raw_text_url: `https://www.federalregister.gov/documents/full_text/text/2026/07/01/${latest}.txt`,
        });
      return Response.json({ results: [], count: 0 });
    },
  );
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  t.after(() => {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  });
  return () => calls;
}

test("agent reads official text, searches cases, forecasts and reviews without changing source facts", async (t) => {
  const calls = setup(t);
  const result = await forecastWithAi(history, baseline, now);
  assert.equal(calls(), 3);
  assert.equal(result.ai?.status, "generated");
  assert.equal(result.current_status, baseline.current_status);
  assert.equal(result.effective_date, baseline.effective_date);
  assert.equal(result.timing, baseline.timing);
  assert.equal(result.ai?.prediction?.event, "effective_date_delay");
  assert.equal(result.ai?.prediction?.window_end, "2027-03-20");
  assert.equal(result.ai?.input_hash?.length, 64);
  assert.equal(result.ai?.research?.steps.length, 2);
  assert.equal(
    result.ai?.research?.sources.find((s) => s.id === latest)?.full_text_read,
    true,
  );
  assert.deepEqual(result.evidence, [latest]);
});

test("uncited, stale-stage, uncalibrated and malformed outputs abstain without a heuristic fallback", async (t) => {
  for (const bad of [
    {
      ...valid,
      reasons: [
        cited("Valid current reason that has enough characters."),
        {
          text: "Invented evidence supporting a claim.",
          evidence: ["2026-FAKE"],
        },
      ],
    },
    { ...valid, target_event: "final_rule" },
    {
      ...valid,
      forecast: "There is a 90% probability of another effective-date delay.",
    },
    { ...valid, horizon_days: 7 },
    { ...valid, current_status: "AI cannot replace current source facts" },
    { ...valid, reasons: [] },
  ])
    await t.test("rejects invalid forecast", async (sub) => {
      setup(sub, bad);
      const result = await forecastWithAi(history, baseline, now);
      assert.equal(result.kind, "insufficient_evidence");
      assert.equal(result.ai?.status, "unavailable");
      assert.notEqual(result.forecast, baseline.forecast);
      assert.equal(result.ai?.prediction, undefined);
    });
});

test("review can reject a schema-valid but generic prediction", async (t) => {
  setup(t, valid, false);
  const result = await forecastWithAi(history, baseline, now);
  assert.equal(result.ai?.status, "withheld");
  assert.equal(result.ai?.review?.approved, false);
  assert.equal(result.ai?.prediction, undefined);
});

test("source checks block the agent and the model may explicitly abstain", async (t) => {
  const calls = setup(t, { ...valid, decision: "abstain" });
  const incomplete = assessStatus(history, false, true, now);
  assert.equal(
    (await forecastWithAi(history, incomplete, now)).ai?.status,
    "withheld",
  );
  assert.equal(calls(), 0);
  const result = await forecastWithAi(history, baseline, now);
  assert.equal(result.kind, "insufficient_evidence");
  assert.equal(result.next_status, "No supported forecast");
  assert.equal(result.ai?.status, "generated");
  assert.equal(result.ai?.prediction, undefined);
});

test("missing configuration and provider failure do not issue deterministic predictions", async (t) => {
  const prior = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (prior !== undefined) process.env.GEMINI_API_KEY = prior;
    else delete process.env.GEMINI_API_KEY;
  });
  assert.equal(
    (await forecastWithAi(history, baseline, now)).kind,
    "insufficient_evidence",
  );
  process.env.GEMINI_API_KEY = "test-only";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "rate limited" }, { status: 429 }),
  );
  const result = await forecastWithAi(history, baseline, now);
  assert.equal(result.ai?.status, "unavailable");
  assert.equal(result.ai?.prediction, undefined);
});

test("research rejects unknown IDs and nonofficial text URLs, preserving failed actions", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ raw_text_url: "https://example.com/private.txt" });
  });
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  const unknown = await agent.run({
    ...action("read_publication", "2026-99999"),
    tool: "read_publication",
  });
  assert.equal(unknown.status, "failed");
  assert.equal(calls, 0);
  const unsafe = await agent.run({
    ...action("read_publication", latest),
    tool: "read_publication",
  });
  assert.equal(unsafe.status, "failed");
  assert.equal(calls, 1);
  assert.equal(agent.report.steps.length, 2);
  assert.ok(!agent.report.sources.some((s) => s.full_text_read));
});

test("historical research excludes future, other-agency and same-proceeding matches", async (t) => {
  const template = history[0].document;
  const comparable = {
    ...template,
    document_number: "2020-10000",
    title: "A different historical case",
    publication_date: "2020-01-01",
    regulation_id_numbers: ["1903-XX99"],
    docket_ids: ["DIFFERENT"],
  };
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      results: [
        template,
        comparable,
        {
          ...comparable,
          document_number: "2026-88888",
          publication_date: "2026-09-22",
        },
        {
          ...comparable,
          document_number: "2020-20000",
          agencies: [{ id: 466, name: "SEC" }],
        },
      ],
    }),
  );
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  const result = await agent.run({
    ...action("find_comparables", "", "direct final"),
    tool: "find_comparables",
  });
  assert.deepEqual(result.source_ids, ["2020-10000"]);
});

test("long text excerpts retain relevant passages and explicitly disclose selection", () => {
  const text =
    "Preamble ".repeat(1000) +
    "\n\nSignificant adverse comments require a substantive response.\n\n" +
    "Background ".repeat(1000);
  const excerpt = excerptFor(text, "adverse comments");
  assert.match(excerpt, /Selected excerpts/);
  assert.match(excerpt, /Significant adverse comments require/);
  assert.ok(excerpt.length < 14500);
});

test("forecast resolution excludes pre-issue events and cannot treat incomplete history as no action", () => {
  const end = forecastEnd(now, 90);
  assert.equal(end, "2026-12-20");
  assert.equal(
    resolveForecast(
      "effective_date_delay",
      now,
      end,
      history,
      true,
      "2026-10-01",
    ),
    "pending",
  );
  assert.equal(
    resolveForecast(
      "effective_date_delay",
      now,
      end,
      history,
      true,
      "2027-01-01",
    ),
    "not_observed",
  );
  assert.equal(
    resolveForecast(
      "no_new_publication",
      now,
      end,
      history,
      false,
      "2027-01-01",
    ),
    "unresolved",
  );
  assert.equal(
    resolveForecast(
      "no_new_publication",
      now,
      end,
      history,
      true,
      "2027-01-01",
    ),
    "observed",
  );
  const future = {
    ...history[0],
    document: { ...history[0].document, publication_date: "2026-12-01" },
  };
  assert.equal(
    resolveForecast(
      "effective_date_delay",
      now,
      end,
      [future, ...history],
      true,
      "2026-12-01",
    ),
    "observed",
  );
  assert.equal(
    resolveForecast(
      "no_new_publication",
      now,
      end,
      [future, ...history],
      true,
      "2026-12-01",
    ),
    "not_observed",
  );
});

test("historical numeric CFR parts normalize without accepting invalid values", () => {
  assert.equal(
    activityDocumentSchema.safeParse({
      ...documents[0],
      document_number: "C1-2019-05695",
    }).success,
    true,
  );
  const parsed = activityDocumentSchema.parse({
    ...documents[0],
    cfr_references: [
      { title: 17, part: 229 },
      { title: "17", part: "240" },
    ],
  });
  assert.deepEqual(parsed.cfr_references, [
    { title: 17, part: "229" },
    { title: 17, part: "240" },
  ]);
  assert.equal(
    activityDocumentSchema.safeParse({
      ...documents[0],
      cfr_references: [{ title: 17, part: null }],
    }).success,
    false,
  );
});

test("historical tracing computes a checked interval without joining another docket", async (t) => {
  const original = {
    ...history[0].document,
    document_number: "2020-10000",
    publication_date: "2020-01-01",
    title: "Historical comparison",
    type: "Proposed Rule",
    action: "Proposed rule.",
    abstract: "A proposal to change the historical requirements.",
    regulation_id_numbers: ["1903-XX99"],
    docket_ids: ["HISTORICAL"],
  };
  const final = {
    ...original,
    document_number: "2020-20000",
    publication_date: "2020-06-29",
    type: "Rule",
    action: "Final rule.",
    abstract: "Final requirements adopted.",
    cfr_references: [{ title: 10, part: 100 }],
  };
  const other = {
    ...final,
    document_number: "2021-10000",
    publication_date: "2021-01-01",
    docket_ids: ["OTHER"],
  };
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    const params = new URL(String(url)).searchParams;
    return Response.json(
      params.has("conditions[regulation_id_number]")
        ? { results: [other, final, original], count: 3 }
        : { results: [original], count: 1 },
    );
  });
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  await agent.run({
    ...action("find_comparables", "", "historical"),
    tool: "find_comparables",
  });
  await agent.run({
    ...action("trace_comparable", "2020-10000"),
    tool: "trace_comparable",
  });
  assert.equal(agent.report.comparisons[0].complete, true);
  assert.equal(agent.report.comparisons[0].elapsed_days, 180);
  assert.deepEqual(agent.report.comparisons[0].evidence, [
    "2020-10000",
    "2020-20000",
  ]);
});

test("source text normalization removes null characters that JSONB cannot store", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: unknown) =>
    String(url).includes("/full_text/")
      ? new Response(
          "Official text with a formatting\u0000 character. ".repeat(10),
        )
      : Response.json({
          raw_text_url: `https://www.federalregister.gov/documents/full_text/text/2026/07/01/${latest}.txt`,
        }),
  );
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  await agent.run({
    ...action("read_publication", latest),
    tool: "read_publication",
  });
  const source = agent.report.sources.find((s) => s.id === latest)!;
  assert.equal(source.full_text_read, true);
  assert.ok(!source.excerpt.includes("\u0000"));
});

test("official text redirects are rejected without following to another origin", async (t) => {
  let reads = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      if (
        String(url).includes("/full_text/") ||
        String(url).includes("/content/pkg/")
      ) {
        reads++;
        assert.equal(init?.redirect, "manual");
        return new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/redirect" },
        });
      }
      return Response.json({
        raw_text_url: `https://www.federalregister.gov/documents/full_text/text/2026/07/01/${latest}.txt`,
      });
    },
  );
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  const step = await agent.run({
    ...action("read_publication", latest),
    tool: "read_publication",
  });
  assert.equal(step.status, "failed");
  assert.equal(reads, 2);
  assert.ok(!agent.report.sources.some((s) => s.full_text_read));
});

test("official GovInfo fallback verifies document identity and preserves text provenance", async (t) => {
  let wrong = false;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("/content/pkg/"))
      return new Response(
        `<html><pre>[FR Doc No: ${wrong ? "2026-99999" : latest}]\n${"Official rule text regarding adverse comments and a delay. ".repeat(10)}</pre></html>`,
      );
    if (String(url).includes("/full_text/"))
      return new Response("Unavailable", { status: 403 });
    return Response.json({
      raw_text_url: `https://www.federalregister.gov/documents/full_text/text/2026/07/01/${latest}.txt`,
    });
  });
  const agent = createResearch(history, "2026-09-21", Date.now() + 10000);
  const step = await agent.run({
    ...action("read_publication", latest),
    tool: "read_publication",
  });
  assert.equal(step.status, "complete");
  assert.equal(
    agent.report.sources.find((s) => s.id === latest)?.text_url,
    `https://www.govinfo.gov/content/pkg/FR-2026-07-01/html/${latest}.htm`,
  );
  wrong = true;
  const invalid = createResearch(history, "2026-09-21", Date.now() + 10000);
  assert.equal(
    (
      await invalid.run({
        ...action("read_publication", latest),
        tool: "read_publication",
      })
    ).status,
    "failed",
  );
});
