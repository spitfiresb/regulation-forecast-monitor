import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { curatedExamples } from "../lib/activity/examples";
import {
  documentId,
  activityWindow,
  activityDocumentSchema,
} from "../lib/activity/model";
import { assessActivity } from "../lib/activity/service";
import {
  ACTIVITY_METHOD,
  assessStatus,
  classifyDocument,
} from "../lib/activity/analysis";
import { ACTIVITY_AI_PROMPT, activityAiModel } from "../lib/activity/ai";
import documents from "./fixtures/activity/doe-delay.json";

test("examples contain publication links and no served assessment snapshots", async () => {
  assert.ok(curatedExamples.length >= 5 && curatedExamples.length <= 10);
  assert.equal(
    new Set(curatedExamples.map((e) => e.id)).size,
    curatedExamples.length,
  );
  for (const example of curatedExamples) documentId.parse(example.id);
  const files = await readdir(
    new URL("../public/examples/", import.meta.url),
  ).catch((e) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  assert.deepEqual(files, []);
});

test("forced assessment bypasses a valid cached success and never falls back when live sources fail", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "live-example-test-"));
  const keys = [
    "LOCAL_DATA_DIR",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "REQUIRE_HOSTED_STORAGE",
  ];
  const prior = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.LOCAL_DATA_DIR = directory;
  t.after(async () => {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const now = new Date().toISOString();
  const history = documents.map((d) =>
    classifyDocument(activityDocumentSchema.parse(d)),
  );
  const selected = {
    ...history[0].document,
    publication_date: now.slice(0, 10),
  };
  const cached = {
    id: selected.document_number,
    selected,
    history,
    checked_at: now,
    window: activityWindow(),
    assessment: {
      ...assessStatus(history, true, true, now),
      method: ACTIVITY_METHOD,
      ai: {
        status: "generated",
        model: activityAiModel(),
        prompt_version: ACTIVITY_AI_PROMPT,
      },
    },
  };
  await mkdir(join(directory, "activity"));
  await writeFile(
    join(directory, "activity", `${cached.id}.json`),
    JSON.stringify(cached),
  );
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("Live source unavailable in this test");
  });
  assert.equal((await assessActivity(cached.id)).checked_at, now);
  assert.equal(requests, 0);
  await assert.rejects(
    assessActivity(cached.id, true),
    /Live source unavailable/,
  );
  assert.equal(requests, 1);
});
