import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeSync } from "../lib/request-guard";

test("refresh rejects cross-origin requests and accepts the configured origin or a server token", () => {
  const oldOrigin = process.env.APP_ORIGIN,
    oldSecret = process.env.SYNC_SECRET;
  process.env.APP_ORIGIN = "https://monitor.example.com";
  process.env.SYNC_SECRET = "test-server-secret";
  try {
    assert.equal(
      authorizeSync(
        new Request(
          "https://monitor.example.com/api/activity/2026-13305/assess",
        ),
      ),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request(
          "https://monitor.example.com/api/activity/2026-13305/assess",
          {
            headers: { origin: "https://attacker.example" },
          },
        ),
      ),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request(
          "https://monitor.example.com/api/activity/2026-13305/assess",
          {
            headers: { origin: "https://monitor.example.com" },
          },
        ),
      ),
      true,
    );
    assert.equal(
      authorizeSync(
        new Request(
          "https://monitor.example.com/api/activity/2026-13305/assess",
          {
            headers: { authorization: "Bearer test-server-secret" },
          },
        ),
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
        new Request("http://localhost:3000/api/activity/2026-13305/assess", {
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
      true,
    );
    assert.equal(
      authorizeSync(
        new Request("http://localhost:3000/api/activity/2026-13305/assess", {
          headers: { origin: "http://127.0.0.1:4000" },
        }),
      ),
      false,
    );
    assert.equal(
      authorizeSync(
        new Request("http://localhost:3000/api/activity/2026-13305/assess", {
          headers: { origin: "http://evil.example:3000" },
        }),
      ),
      false,
    );
  } finally {
    if (before !== undefined) process.env.APP_ORIGIN = before;
  }
});
