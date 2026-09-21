import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import baseline from "@/data/baseline.json";
import { snapshotSchema, type Snapshot, type DashboardData } from "./model";
import { buildForecast } from "./forecast";

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error(
      "Supabase configuration is incomplete. Both the project URL and server secret key are required.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function localDirectory() {
  return process.env.LOCAL_DATA_DIR || join(process.cwd(), ".data");
}
function localPath() {
  return join(localDirectory(), "latest.json");
}
async function readDashboard(): Promise<Omit<DashboardData, "as_of">> {
  const seed = snapshotSchema.parse(baseline);
  try {
    const client = supabase();
    if (client) {
      const { data, error } = await client
        .from("sync_runs")
        .select("snapshot")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error)
        throw new Error("The saved database record could not be loaded.");
      return data
        ? { ...snapshotSchema.parse(data.snapshot), storage: "supabase" }
        : { ...seed, storage: "snapshot" };
    }
    try {
      return {
        ...snapshotSchema.parse(
          JSON.parse(await readFile(localPath(), "utf8")),
        ),
        storage: "local",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { ...seed, storage: "snapshot" };
  } catch {
    return {
      ...seed,
      storage: "snapshot",
      storage_warning:
        "Saved data is unavailable. Showing the bundled official-source snapshot; its verification date is shown below.",
    };
  }
}
export async function getDashboard(): Promise<DashboardData> {
  const data = await readDashboard();
  // Apply current interpretation rules to old snapshots without changing source dates.
  const forecast = buildForecast(
    data.rule,
    data.signals,
    data.forecast.updated_at,
  );
  forecast.expected_change = data.forecast.expected_change;
  forecast.summary_method = data.forecast.summary_method;
  return { ...data, forecast, as_of: Date.now() };
}
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
        "Official data was fetched but could not be saved to Supabase. Check that the migration has been applied and the server key is valid.",
      );
    return "supabase";
  }
  if (process.env.VERCEL || process.env.CF_PAGES)
    throw new Error(
      "Configure Supabase before refreshing on a serverless host.",
    );
  const path = localPath();
  await mkdir(localDirectory(), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(parsed, null, 2), { mode: 0o600 });
  await rename(temp, path);
  return "local";
}
