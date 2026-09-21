import { test } from "node:test";
import assert from "node:assert/strict";
import documents from "./fixtures/activity/doe-delay.json";
import { activityDocumentSchema } from "../lib/activity/model";
import { classifyDocument, assessStatus } from "../lib/activity/analysis";
import { forecastWithAi } from "../lib/activity/ai";

const history = documents.map((d) =>
  classifyDocument(activityDocumentSchema.parse(d)),
);
const now = "2026-09-21T12:00:00Z";
const baseline = assessStatus(history, true, true, now);
const valid = {
  outcome: "forecast",
  next_status: "Another effective-date delay",
  forecast:
    "Another postponement is a plausible leading scenario, given the repeated extensions.",
  reasons: [
    {
      text: "The latest notice continues a sequence of delays.",
      evidence: ["2026-13305"],
    },
  ],
  alternatives: ["The rule may take effect as scheduled."],
};

test("AI forecasts are cited and cannot overwrite source status or dates", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      assert.ok(request.generationConfig.responseJsonSchema);
      const input = JSON.parse(request.contents[0].parts[0].text);
      assert.equal(input.history.length, history.length);
      assert.equal(input.current_status, baseline.current_status);
      assert.equal("next_status" in input, false);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(valid) }] },
          },
        ],
      });
    },
  );
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  try {
    const result = await forecastWithAi(history, baseline, now);
    assert.equal(result.ai?.status, "generated");
    assert.equal(result.current_status, baseline.current_status);
    assert.equal(result.effective_date, baseline.effective_date);
    assert.equal(result.timing, baseline.timing);
    assert.equal(result.ai?.input_hash?.length, 64);
    assert.deepEqual(result.evidence, ["2026-13305"]);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("unsafe, uncited, incomplete, and unavailable AI responses use a labeled fallback", async (t) => {
  let payload: unknown = valid;
  let finishReason = "STOP";
  let status = 200;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        candidates: [
          {
            finishReason,
            content: { parts: [{ text: JSON.stringify(payload) }] },
          },
        ],
      },
      { status },
    ),
  );
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  try {
    for (const bad of [
      {
        ...valid,
        reasons: [
          {
            text: "A fabricated source supports this scenario.",
            evidence: ["2026-FAKE"],
          },
        ],
      },
      {
        ...valid,
        reasons: [
          {
            text: "Only an earlier publication is referenced.",
            evidence: [history.at(-1)!.document.document_number],
          },
        ],
      },
      {
        ...valid,
        forecast: "The rule has a 90% probability of taking effect.",
      },
      { ...valid, effective_date: "2027-01-01" },
      { ...valid, reasons: [] },
    ]) {
      payload = bad;
      const result = await forecastWithAi(history, baseline, now);
      assert.equal(result.ai?.status, "unavailable");
      assert.equal(result.forecast, baseline.forecast);
    }
    payload = valid;
    finishReason = "MAX_TOKENS";
    assert.equal(
      (await forecastWithAi(history, baseline, now)).ai?.status,
      "unavailable",
    );
    finishReason = "STOP";
    status = 429;
    assert.equal(
      (await forecastWithAi(history, baseline, now)).ai?.status,
      "unavailable",
    );
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("incomplete evidence never reaches the model, and a model can abstain", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...valid,
                  outcome: "insufficient_evidence",
                }),
              },
            ],
          },
        },
      ],
    });
  });
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  try {
    const incomplete = assessStatus(history, false, true, now);
    assert.equal(
      (await forecastWithAi(history, incomplete, now)).ai?.status,
      "withheld",
    );
    assert.equal(calls, 0);
    const result = await forecastWithAi(history, baseline, now);
    assert.equal(result.kind, "insufficient_evidence");
    assert.equal(result.next_status, "Unresolved");
    assert.equal(result.ai?.status, "generated");
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});
