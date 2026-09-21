// Runs the actual migration in a disposable local PostgreSQL cluster.
// No existing database, Supabase account, network listener, or secrets are used.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

  // Upgrade a populated database, not just an empty schema.
  // Discover all migrations so newly recovered cleanup migrations are tested too.
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (name) => name.endsWith(".sql") && name > "202609210001_regulation_z.sql",
    )
    .sort())
    sql(readFileSync(join("supabase/migrations", file), "utf8"));
  assert.equal(
    sql("select to_regclass('public.sync_runs_rule_latest_idx') is null"),
    "t",
  );
  assert.match(
    sql(
      "begin; drop index sync_runs_latest_idx; set local enable_seqscan = off; explain select snapshot from sync_runs where rule_id = 'apor-contingency' order by synced_at desc limit 10; rollback;",
    ),
    /Index Scan Backward using sync_runs_rule_id_synced_at_key/,
  );
  assert.equal(
    sql("select latest_snapshot->'rule'->>'rin' from rules"),
    baseline.rule.rin,
  );
  const second = structuredClone(baseline);
  second.rule.id = "2040-aa01";
  second.rule.rin = "2040-AA01";
  second.rule.agency = "Test agency";
  second.forecast.id = "forecast-2040-aa01";
  second.forecast.rule_id = second.rule.id;
  const signalIds = new Map(
    second.signals.map((s) => [s.id, `second-${s.id}`]),
  );
  second.signals.forEach((s) => {
    s.rule_id = second.rule.id;
    s.id = signalIds.get(s.id)!;
  });
  for (const key of ["change", "likelihood", "timing"] as const)
    second.forecast.evidence[key] = second.forecast.evidence[key].map((id) =>
      signalIds.get(id)!,
    );
  second.synced_at = new Date().toISOString();
  const saveSnapshot = (snapshot: unknown) =>
    sql(
      `set role service_role; select public.save_rule_snapshot(${literal(snapshot)});`,
    );
  saveSnapshot(second);
  saveSnapshot(second);
  assert.equal(sql("select count(*) from rules"), "2");
  assert.equal(
    sql("select count(*) from sync_runs where rule_id='2040-aa01'"),
    "1",
  );
  const refreshed = structuredClone(second);
  refreshed.synced_at = new Date(
    Date.parse(second.synced_at) + 1000,
  ).toISOString();
  refreshed.forecast.updated_at = refreshed.synced_at;
  refreshed.signals.forEach((s) => {
    s.observed_at = refreshed.synced_at;
  });
  refreshed.forecast.reasoning.push("Checked on a new date");
  saveSnapshot(refreshed);
  assert.equal(
    sql("select count(*) from sync_runs where rule_id='2040-aa01'"),
    "1",
  );
  assert.equal(
    sql("select latest_snapshot->>'synced_at' from rules where id='2040-aa01'"),
    refreshed.synced_at,
  );
  const changed = structuredClone(refreshed);
  changed.synced_at = new Date(
    Date.parse(second.synced_at) + 2000,
  ).toISOString();
  changed.rule.summary = "Changed official abstract";
  saveSnapshot(changed);
  assert.equal(
    sql("select count(*) from sync_runs where rule_id='2040-aa01'"),
    "2",
  );
  assert.throws(() => saveSnapshot(refreshed));
  const collision = structuredClone(changed);
  collision.synced_at = new Date(
    Date.parse(second.synced_at) + 3000,
  ).toISOString();
  collision.signals[0].id = baseline.signals[0].id;
  collision.forecast.evidence.likelihood[0] = collision.signals[0].id;
  assert.throws(() => saveSnapshot(collision));
  assert.equal(
    sql("select latest_snapshot->>'synced_at' from rules where id='2040-aa01'"),
    changed.synced_at,
  );
  // Expired historical versions disappear; the latest state and current evidence survive.
  sql(
    `insert into sync_runs(rule_id,synced_at,snapshot) values('2040-aa01',now()-interval '7 months',${literal(second)});`,
  );
  sql("set role service_role; select public.prune_rule_history();");
  assert.equal(
    sql(
      "select count(*) from sync_runs where synced_at < now()-interval '6 months'",
    ),
    "0",
  );
  assert.equal(
    sql("select count(*) from rules where latest_snapshot is not null"),
    "2",
  );
  assert.equal(
    sql("select count(*) from signals"),
    String(baseline.signals.length * 2),
  );

  const catalog = {
    publication_id: "202510",
    imported_at: new Date().toISOString(),
    source_url: "https://www.reginfo.gov/public/do/eAgendaXmlReport",
    entries: [
      {
        ...second.rule,
        publication_id: "202510",
        agency_code: "2040",
        timetable: [],
      },
    ],
  };
  sql(
    `set role service_role; select public.save_rule_catalog(${literal(catalog)});`,
  );
  assert.equal(sql("select count(*) from rule_catalog where is_current"), "1");
  assert.equal(sql("select entry_count from catalog_import"), "1");
  assert.throws(() =>
    sql(
      `set role service_role; select public.save_rule_catalog(${literal({ ...catalog, entries: [] })});`,
    ),
  );
  assert.equal(sql("select count(*) from rule_catalog where is_current"), "1");
  assert.equal(
    sql(
      "select count(*) from pg_class where relname in ('rule_catalog','catalog_import') and relrowsecurity",
    ),
    "2",
  );
  for (const functionName of [
    "save_rule_catalog(jsonb)",
    "prune_rule_history()",
  ])
    assert.equal(
      sql(
        `select has_function_privilege('anon','public.${functionName}','EXECUTE')`,
      ),
      "f",
    );
  assert.equal(
    sql(
      "set role service_role; select count(*) from browse_rule_catalog('',null,10,0,ARRAY['20'])",
    ),
    "1",
  );
  assert.equal(
    sql(
      "set role service_role; select count(*) from browse_rule_catalog('',null,10,0,ARRAY['3170'])",
    ),
    "0",
  );
  assert.equal(
    sql(
      "set role service_role; select count(*) from browse_rule_catalog('',null,10,0,null)",
    ),
    "1",
  );
  const issue = {
    id: "a".repeat(64),
    rule_id: "2040-aa01",
    issued_at: new Date().toISOString(),
    window_end: new Date(Date.now() + 180 * 86400000).toISOString(),
  };
  sql(
    `set role service_role; insert into prediction_issues(id,rule_id,issued_at,window_end,payload) values('${issue.id}','${issue.rule_id}','${issue.issued_at}','${issue.window_end}',${literal(issue)});`,
  );
  assert.throws(() =>
    sql(
      `set role service_role; update prediction_issues set issued_at=now() where id='${issue.id}';`,
    ),
  );
  assert.throws(() =>
    sql(
      `set role service_role; delete from prediction_issues where id='${issue.id}';`,
    ),
  );
  assert.equal(
    sql("select has_table_privilege('anon','prediction_issues','SELECT')"),
    "f",
  );
  assert.equal(
    sql(
      "set role service_role; select count(*) from search_rule_catalog('2040-AA01',null,10,0)",
    ),
    "1",
  );
  assert.equal(
    sql(
      "set role service_role; select count(*) from search_rule_catalog('2040-AA01','3170',10,0)",
    ),
    "0",
  );
  assert.equal(
    sql(
      "set role service_role; select total from search_rule_catalog('',null,10,0) limit 1",
    ),
    "1",
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
  // Optional validation of a real downloaded catalog, still in the disposable DB.
  if (process.argv[2]) {
    const { catalogSchema } = await import("../lib/model");
    const imported = catalogSchema.parse(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
    );
    sql("delete from rule_catalog; delete from catalog_import;");
    sql(
      `set role service_role; select public.save_rule_catalog(${literal(imported)});`,
    );
    assert.equal(
      sql("select count(*) from rule_catalog where is_current"),
      String(imported.entries.length),
    );
    console.log(
      `Real catalog verified: ${imported.entries.length} entries; catalog tables and indexes use ${sql("select pg_size_pretty(pg_total_relation_size('rule_catalog') + pg_total_relation_size('catalog_import'))")}.`,
    );
  }
  console.log(
    "PostgreSQL checks passed: populated upgrade, multiple rules, change-only history, six-month retention, catalog import, RLS, rollback, and stale/cross-rule write rejection.",
  );
} finally {
  if (started)
    run("pg_ctl", ["-D", join(temp, "db"), "-m", "fast", "-w", "stop"]);
  rmSync(temp, { recursive: true, force: true });
}
