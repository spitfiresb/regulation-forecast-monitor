import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import baseline from "@/data/baseline.json";
import {
  RULE_ID,
  ruleIdSchema,
  snapshotSchema,
  type Snapshot,
  type DashboardData,
} from "./model";
import { buildForecast } from "./forecast";
import { historyCutoff, snapshotFingerprint } from "./history";
import { supabase, localDirectory, atomicJson } from "./storage";

type LocalRecord = { latest: Snapshot; history: Snapshot[] };
const pathFor = (id: string) =>
  join(localDirectory(), "rules", `${ruleIdSchema.parse(id)}.json`);
async function readLocal(id: string): Promise<LocalRecord | null> {
  try {
    const value = JSON.parse(await readFile(pathFor(id), "utf8"));
    const record = {
      latest: snapshotSchema.parse(value.latest),
      history: (value.history as unknown[]).map((s) => snapshotSchema.parse(s)),
    };
    if (
      record.latest.rule.id !== id ||
      record.history.some((s) => s.rule.id !== id)
    )
      throw new Error("Saved rule identity mismatch");
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Adopt the original single-rule local record without altering its source dates.
  if (id === RULE_ID) {
    try {
      const latest = snapshotSchema.parse(
        JSON.parse(
          await readFile(join(localDirectory(), "latest.json"), "utf8"),
        ),
      );
      if (latest.rule.id !== id)
        throw new Error("Saved rule identity mismatch");
      return { latest, history: [latest] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  ruleIdSchema.parse(id);
  const client = supabase();
  if (!client) return (await readLocal(id))?.latest ?? null;
  const { data, error } = await client
    .from("rules")
    .select("latest_snapshot")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error(
      "The saved database record could not be loaded. Check the catalog migration.",
    );
  if (!data?.latest_snapshot) return null;
  const snapshot = snapshotSchema.parse(data.latest_snapshot);
  if (snapshot.rule.id !== id) throw new Error("Saved rule identity mismatch");
  return snapshot;
}

export async function getDashboard(id = RULE_ID): Promise<DashboardData> {
  ruleIdSchema.parse(id);
  let data: Omit<DashboardData, "as_of">;
  try {
    const saved = await getSnapshot(id);
    if (saved) data = { ...saved, storage: supabase() ? "supabase" : "local" };
    else if (id === RULE_ID)
      data = { ...snapshotSchema.parse(baseline), storage: "snapshot" };
    else
      throw new Error(
        "No verified snapshot exists for this rule. Refresh it first.",
      );
  } catch (error) {
    if (id !== RULE_ID) throw error;
    data = {
      ...snapshotSchema.parse(baseline),
      storage: "snapshot",
      storage_warning:
        "Saved data is unavailable. Showing the bundled official-source snapshot; its verification date is shown below.",
    };
  }
  const forecast = buildForecast(
    data.rule,
    data.signals,
    data.forecast.updated_at,
  );
  forecast.expected_change = data.forecast.expected_change;
  forecast.summary_method = data.forecast.summary_method;
  return { ...data, forecast, as_of: Date.now() };
}

// The local adapter supports one process. Serialize writes per rule to prevent
// concurrent callers from losing history or allowing stale overwrites.
const writes = new Map<string, Promise<unknown>>();
export async function saveSnapshot(
  snapshot: Snapshot,
): Promise<"supabase" | "local"> {
  const parsed = snapshotSchema.parse(snapshot);
  const client = supabase();
  if (client) {
    const { error } = await client.rpc("save_rule_snapshot", {
      p_snapshot: parsed,
    });
    if (error)
      throw new Error(
        "Official data was fetched but could not be saved to Supabase. Check that the migrations have been applied and the server key is valid.",
      );
    return "supabase";
  }
  const id = parsed.rule.id;
  const pending = (writes.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const previous = await readLocal(id);
      if (previous && previous.latest.rule.rin !== parsed.rule.rin)
        throw new Error("Rule identity cannot change");
      if (
        previous &&
        Date.parse(previous.latest.synced_at) >= Date.parse(parsed.synced_at)
      ) {
        if (JSON.stringify(previous.latest) === JSON.stringify(parsed)) return;
        throw new Error(
          "A newer refresh already completed; reload the dashboard",
        );
      }
      const cutoff = historyCutoff();
      const history = (previous?.history ?? []).filter(
        (s) => s.synced_at >= cutoff,
      );
      if (
        (!previous ||
          snapshotFingerprint(previous.latest) !==
            snapshotFingerprint(parsed)) &&
        parsed.synced_at >= cutoff
      )
        history.push(parsed);
      await atomicJson(pathFor(id), { latest: parsed, history });
    });
  writes.set(id, pending);
  try {
    await pending;
  } finally {
    if (writes.get(id) === pending) writes.delete(id);
  }
  return "local";
}

export async function getHistory(id: string): Promise<Snapshot[]> {
  ruleIdSchema.parse(id);
  const cutoff = historyCutoff();
  const client = supabase();
  if (!client)
    return (
      (await readLocal(id))?.history
        .filter((s) => s.synced_at >= cutoff)
        .reverse() ?? []
    );
  const snapshots: Snapshot[] = [];
  // PostgREST defaults to a bounded response: page explicitly rather than silently truncate.
  for (let start = 0; ; start += 500) {
    const { data, error } = await client
      .from("sync_runs")
      .select("snapshot")
      .eq("rule_id", id)
      .gte("synced_at", cutoff)
      .order("synced_at", { ascending: false })
      .range(start, start + 499);
    if (error) throw new Error("Rule history could not be loaded");
    snapshots.push(...data.map((r) => snapshotSchema.parse(r.snapshot)));
    if (data.length < 500) return snapshots;
  }
}

export async function pruneHistory(): Promise<void> {
  const client = supabase();
  if (client) {
    const { error } = await client.rpc("prune_rule_history");
    if (error) throw new Error("History retention cleanup failed");
    return;
  }
  let files: string[];
  try {
    files = await readdir(join(localDirectory(), "rules"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const id = file.slice(0, -5);
    const pending = (writes.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const record = await readLocal(id);
        if (record)
          await atomicJson(pathFor(id), {
            latest: record.latest,
            history: record.history.filter(
              (s) => s.synced_at >= historyCutoff(),
            ),
          });
      });
    writes.set(id, pending);
    try {
      await pending;
    } finally {
      if (writes.get(id) === pending) writes.delete(id);
    }
  }
}
