// Runs the actual migration in a disposable local PostgreSQL cluster.
// No existing database, Supabase account, network listener, or secrets are used.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import baseline from "../data/baseline.json";

const bin =
  process.env.PG_BIN ||
  execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
const temp = mkdtempSync(join(tmpdir(), "regz-postgres-"));
let started = false;
const run = (command: string, args: string[], input?: string) =>
  execFileSync(join(bin, command), args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (query: string) =>
  run(
    "psql",
    [
      "-h",
      temp,
      "-p",
      "55432",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    query,
  ).trim();
const literal = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
try {
  run("initdb", [
    "-D",
    join(temp, "db"),
    "-U",
    "postgres",
    "-A",
    "trust",
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  run("pg_ctl", [
    "-D",
    join(temp, "db"),
    "-l",
    join(temp, "server.log"),
    "-o",
    `-k ${temp} -h '' -p 55432`,
    "-w",
    "start",
  ]);
  started = true;
  sql(
    "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;",
  );
  sql(
    readFileSync("supabase/migrations/202609210001_regulation_z.sql", "utf8"),
  );
  const save = `set role service_role; select public.save_rule_snapshot(${literal(baseline)});`;
  sql(save);
  sql(save);
  assert.equal(sql("select count(*) from rules"), "1");
  assert.equal(
    sql("select count(*) from signals"),
    String(baseline.signals.length),
  );
  assert.equal(sql("select count(*) from sync_runs"), "1");
  assert.equal(sql("select expected_action_date from forecasts"), "2026-07");
  assert.equal(sql("select effective_date is null from forecasts"), "t");
  assert.equal(
    sql(
      "select count(*) from pg_class where relname in ('rules','signals','forecasts','sync_runs') and relrowsecurity",
    ),
    "4",
  );
  assert.equal(
    sql(
      "select has_function_privilege('anon','public.save_rule_snapshot(jsonb)','EXECUTE')",
    ),
    "f",
  );
  assert.equal(
    sql("select has_table_privilege('authenticated','public.rules','SELECT')"),
    "f",
  );
  const invalid = structuredClone(baseline);
  invalid.rule.title = "This must be rolled back";
  invalid.signals[0].rule_id = "unrelated-rule";
  assert.throws(() =>
    sql(
      `set role service_role; select public.save_rule_snapshot(${literal(invalid)});`,
    ),
  );
  assert.equal(sql("select title from rules"), baseline.rule.title);
  const older = { ...baseline, synced_at: "2020-01-01T00:00:00.000Z" };
  assert.throws(() =>
    sql(
      `set role service_role; select public.save_rule_snapshot(${literal(older)});`,
    ),
  );
  console.log(
    "PostgreSQL checks passed: migration, server-role writes, idempotency, date precision, row-level security, transaction rollback, stale-write rejection.",
  );
} finally {
  if (started)
    run("pg_ctl", ["-D", join(temp, "db"), "-m", "fast", "-w", "stop"]);
  rmSync(temp, { recursive: true, force: true });
}
