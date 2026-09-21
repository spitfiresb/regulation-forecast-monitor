import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentGuard } from "../lib/deployment-guard";

test("deployment protection separates read/write budgets and leaves pages accessible", async () => {
  const calls: string[] = [];
  const env = {
    API_READ_LIMIT: { limit: async ({ key }: { key: string }) => {
      calls.push(`read:${key}`); return { success: true };
    } },
    API_WRITE_LIMIT: { limit: async ({ key }: { key: string }) => {
      calls.push(`write:${key}`); return { success: false };
    } },
  };
  const base = "https://kobaltinterview.party";
  assert.equal(await deploymentGuard(new Request(base), env), null);
  assert.equal(await deploymentGuard(new Request(`${base}/api/activity`, {
    headers: { "cf-connecting-ip": "192.0.2.1" },
  }), env), null);
  const response = await deploymentGuard(new Request(`${base}/api/activity/2026-13305/assess`, {
    method: "POST", headers: { "cf-connecting-ip": "192.0.2.1" },
  }), env);
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("Retry-After"), "60");
  assert.deepEqual(calls, ["read:192.0.2.1", "write:192.0.2.1"]);
});

test("unavailable rate protection does not allow expensive API work", async () => {
  const failed = { limit: async () => { throw new Error("Unavailable"); } };
  const response = await deploymentGuard(new Request("https://kobaltinterview.party/api/activity"), {
    API_READ_LIMIT: failed, API_WRITE_LIMIT: failed,
  });
  assert.equal(response?.status, 503);
});
