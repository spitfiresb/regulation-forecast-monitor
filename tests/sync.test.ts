import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "../data/baseline.json";
import { snapshotSchema } from "../lib/model";
import { collectSnapshot, syncRule } from "../lib/sync";
import { getDashboard, saveSnapshot } from "../lib/repository";
import { summarizeChange } from "../lib/gemini";
import { authorizeSync } from "../lib/request-guard";

const index = readFileSync(
  new URL("./fixtures/reginfo-index.html", import.meta.url),
  "utf8",
);
const rule = readFileSync(
  new URL("./fixtures/reginfo-rule.html", import.meta.url),
  "utf8",
);
const previous = snapshotSchema.parse(baseline);

test("refresh, persistence, source failure, and optional AI behavior", async (t) => {
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), "regz-tests-"));
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "VERCEL",
    "CF_PAGES",
  ])
    delete process.env[name];
  process.env.LOCAL_DATA_DIR = dir;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });
  let failReginfo = false,
    failRegister = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("federalregister")) {
      if (failRegister) throw new Error("Unavailable");
      return Response.json({ count: 0 });
    }
    if (failReginfo) throw new Error("Unavailable");
    return new Response(url.includes("eAgendaMain") ? index : rule);
  };
  await t.test(
    "working refresh persists a complete snapshot and coalesces concurrent calls",
    async () => {
      const a = syncRule(),
        b = syncRule();
      assert.equal(a, b);
      const result = await a;
      assert.equal(result.storage, "local");
      assert.equal(result.forecast.likelihood, "DEVELOPING");
      assert.equal((await getDashboard()).synced_at, result.synced_at);
      assert.equal(result.warnings.length, 0);
    },
  );
  await t.test(
    "failed Reginfo leaves the previous saved record intact",
    async () => {
      const saved = await getDashboard();
      failReginfo = true;
      await assert.rejects(syncRule(), /previous record has been retained/);
      assert.equal((await getDashboard()).synced_at, saved.synced_at);
      failReginfo = false;
    },
  );
  await t.test(
    "failed Federal Register retains old evidence without changing its verification time",
    async () => {
      failRegister = true;
      const result = await collectSnapshot(previous);
      assert.equal(
        result.federal_register_checked_at,
        previous.federal_register_checked_at,
      );
      assert.ok(
        result.warnings.some((w) =>
          w.includes("current publication status is unverified"),
        ),
      );
      const empty = await collectSnapshot();
      assert.equal(empty.federal_register_checked_at, null);
      assert.ok(
        empty.forecast.reasoning.some((r) => r.includes("not been verified")),
      );
      failRegister = false;
    },
  );
  await t.test(
    "incomplete Supabase setup is an error on writes, not a silent local fallback",
    async () => {
      process.env.SUPABASE_URL = "https://example.supabase.co";
      await assert.rejects(
        saveSnapshot(previous),
        /configuration is incomplete/,
      );
      delete process.env.SUPABASE_URL;
    },
  );
  await t.test(
    "without a Gemini key the exact official excerpt is used",
    async () => {
      const result = await summarizeChange(previous.rule.summary);
      assert.equal(result.method, "official-excerpt");
      assert.ok(previous.rule.summary.includes(result.text));
    },
  );
  await t.test(
    "Gemini returns only the summary and rejects fabricated dates",
    async () => {
      process.env.GEMINI_API_KEY = "test-placeholder";
      globalThis.fetch = async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      expected_change:
                        "CFPB is considering a fallback calculation for APOR when weekly tables are unavailable.",
                    }),
                  },
                ],
              },
            },
          ],
        });
      assert.equal(
        (await summarizeChange(previous.rule.summary)).method,
        "gemini",
      );
      globalThis.fetch = async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      expected_change:
                        "The final rule will take effect in July 2027.",
                    }),
                  },
                ],
              },
            },
          ],
        });
      assert.equal(
        (await summarizeChange(previous.rule.summary)).method,
        "official-excerpt",
      );
      globalThis.fetch = async () =>
        new Response("rate limited", { status: 429 });
      assert.equal(
        (await summarizeChange(previous.rule.summary)).method,
        "official-excerpt",
      );
    },
  );
});

test("refresh rejects cross-origin requests and accepts the configured origin or a server token", () => {
  const oldOrigin = process.env.APP_ORIGIN,
    oldSecret = process.env.SYNC_SECRET;
  process.env.APP_ORIGIN = "https://monitor.example.com";
  process.env.SYNC_SECRET = "test-server-secret";
  try {
    assert.equal(
      authorizeSync(new Request("https://monitor.example.com/api/sync")),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request("https://monitor.example.com/api/sync", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request("https://monitor.example.com/api/sync", {
          headers: { origin: "https://monitor.example.com" },
        }),
      ),
      true,
    );
    assert.equal(
      authorizeSync(
        new Request("https://monitor.example.com/api/sync", {
          headers: { authorization: "Bearer test-server-secret" },
        }),
      ),
      true,
    );
  } finally {
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
    if (oldSecret === undefined) delete process.env.SYNC_SECRET;
    else process.env.SYNC_SECRET = oldSecret;
  }
});

test("development refresh accepts loopback aliases used by Next without allowing remote origins", () => {
  const before = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    assert.equal(
      authorizeSync(
        new Request("http://localhost:3000/api/sync", {
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
      true,
    );
    assert.equal(
      authorizeSync(
        new Request("http://localhost:3000/api/sync", {
          headers: { origin: "http://127.0.0.1:4000" },
        }),
      ),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request("http://localhost:3000/api/sync", {
          headers: { origin: "http://evil.example:3000" },
        }),
      ),
      false,
    );
  } finally {
    if (before !== undefined) process.env.APP_ORIGIN = before;
  }
});
