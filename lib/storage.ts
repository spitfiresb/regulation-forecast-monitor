import { createClient } from "@supabase/supabase-js";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !key) {
    if (process.env.REQUIRE_HOSTED_STORAGE === "true")
      throw new Error("Supabase must be configured for this deployment.");
    return null;
  }
  if (!url || !key)
    throw new Error(
      "Supabase configuration is incomplete. Both the project URL and server secret key are required.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function localDirectory() {
  return process.env.LOCAL_DATA_DIR || join(process.cwd(), ".data");
}
export async function atomicJson(path: string, value: unknown) {
  if (process.env.VERCEL || process.env.CF_PAGES)
    throw new Error(
      "Configure Supabase before refreshing on a serverless host.",
    );
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}
