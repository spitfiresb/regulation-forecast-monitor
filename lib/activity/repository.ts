import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabase, localDirectory, atomicJson } from "../storage";
import { documentId, type ActivityCase } from "./model";
export async function getActivityCase(
  id: string,
): Promise<ActivityCase | null> {
  documentId.parse(id);
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("activity_records")
      .select("payload")
      .eq("document_number", id)
      .maybeSingle();
    if (error) throw new Error("Saved activity could not be loaded.");
    return data?.payload ?? null;
  }
  try {
    return JSON.parse(
      await readFile(join(localDirectory(), "activity", `${id}.json`), "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function saveActivityCase(record: ActivityCase) {
  const db = supabase();
  if (db) {
    const { error } = await db.rpc("save_activity_case", { p_record: record });
    if (error)
      throw new Error(
        "The source check completed, but its record and assessment could not be saved.",
      );
  } else {
    await atomicJson(
      join(localDirectory(), "activity", `${record.id}.json`),
      record,
    );
    // Fingerprints omit retrieval time: identical evidence creates no new issue.
    const file = join(
      localDirectory(),
      "activity-assessments",
      `${record.fingerprint}.json`,
    );
    try {
      await readFile(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      await atomicJson(file, record);
    }
  }
}
