// Runs the actual migration in a disposable local PostgreSQL cluster.
// No existing database, Supabase account, network listener, or secrets are used.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

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
      "-qAt",
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
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sql(readFileSync(join("supabase/migrations", file), "utf8"));
  assert.equal(
    sql(
      "select count(*) from pg_class where relname in ('activity_records','activity_assessments') and relrowsecurity",
    ),
    "2",
  );
  assert.equal(
    sql(
      "select has_function_privilege('anon','public.save_activity_case(jsonb)','EXECUTE')",
    ),
    "f",
  );
  assert.equal(
    sql(
      "select has_table_privilege('authenticated','activity_records','SELECT')",
    ),
    "f",
  );
  const activity = { id: "2026-13305", fingerprint: "b".repeat(64) };
  sql(
    `set role service_role; insert into activity_records(document_number,publication_date,checked_at,payload) values('2026-13305','2026-07-01',now(),${literal(activity)}); insert into activity_assessments(fingerprint,document_number,payload) values('${activity.fingerprint}','2026-13305',${literal(activity)});`,
  );
  assert.equal(
    sql("select has_table_privilege('anon','activity_records','SELECT')"),
    "f",
  );
  assert.throws(() =>
    sql(
      "set role service_role; update activity_assessments set payload='{}'::jsonb",
    ),
  );
  assert.throws(() =>
    sql("set role service_role; delete from activity_assessments"),
  );
  assert.equal(sql("select count(*) from activity_assessments"), "1");
  const activityCheck = {
    id: "2026-88888",
    selected: { publication_date: "2026-07-01" },
    checked_at: "2026-09-21T12:00:00Z",
    fingerprint: "c".repeat(64),
  };
  const writeActivity = (value: unknown) =>
    sql(`set role service_role; select save_activity_case(${literal(value)})`);
  writeActivity(activityCheck);
  writeActivity(activityCheck);
  assert.equal(
    sql(
      "select count(*) from activity_assessments where document_number='2026-88888'",
    ),
    "1",
  );
  assert.throws(() =>
    writeActivity({ ...activityCheck, checked_at: "2026-09-20T12:00:00Z" }),
  );
  assert.throws(() =>
    writeActivity({
      ...activityCheck,
      checked_at: "2026-09-22T12:00:00Z",
      fingerprint: null,
    }),
  );
  assert.equal(
    sql(
      "select payload->>'checked_at' from activity_records where document_number='2026-88888'",
    ),
    activityCheck.checked_at,
  );
  console.log(
    "PostgreSQL checks passed: migration chain, activity persistence, RLS, immutable assessments, deduplication, rollback, and stale-write rejection.",
  );
} finally {
  if (started)
    run("pg_ctl", ["-D", join(temp, "db"), "-m", "fast", "-w", "stop"]);
  rmSync(temp, { recursive: true, force: true });
}
