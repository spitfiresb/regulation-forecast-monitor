import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabase, localDirectory, atomicJson } from "../storage";
import { predictionSchema, type Prediction } from "./model";
import { buildPrediction, currentEvaluation } from "./engine";
import { type CatalogEntry, type Snapshot } from "../model";
export async function getPrediction(
  ruleId: string,
): Promise<Prediction | null> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("prediction_issues")
      .select("payload")
      .eq("rule_id", ruleId)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Forecast history could not be loaded.");
    return data ? predictionSchema.parse(data.payload) : null;
  }
  try {
    return predictionSchema.parse(
      JSON.parse(
        await readFile(
          join(localDirectory(), "predictions", `${ruleId}.json`),
          "utf8",
        ),
      ),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function getPredictionById(
  id: string,
): Promise<Prediction | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("prediction_issues")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Forecast evidence could not be loaded.");
    return data ? predictionSchema.parse(data.payload) : null;
  }
  try {
    return predictionSchema.parse(
      JSON.parse(
        await readFile(
          join(localDirectory(), "prediction-issues", `${id}.json`),
          "utf8",
        ),
      ),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function issuePrediction(
  entry: CatalogEntry,
  snapshot: Snapshot,
): Promise<Prediction> {
  const issue = predictionSchema.parse(buildPrediction(entry, snapshot));
  const previous = await getPrediction(entry.id);
  // Identical source check and method replay returns the exact original issue.
  if (
    previous?.evidence_cutoff === snapshot.synced_at &&
    previous.evaluation_version === currentEvaluation().version &&
    previous.method_version === issue.method_version
  )
    return previous;
  const db = supabase();
  if (db) {
    const { error } = await db.from("prediction_issues").insert({
      id: issue.id,
      rule_id: issue.rule_id,
      issued_at: issue.issued_at,
      window_end: issue.window_end,
      payload: issue,
    });
    if (error)
      throw new Error(
        "Official data was saved, but the forecast could not be recorded. Retry the refresh.",
      );
  } else {
    await atomicJson(
      join(localDirectory(), "prediction-issues", `${issue.id}.json`),
      issue,
    );
    await atomicJson(
      join(localDirectory(), "predictions", `${entry.id}.json`),
      issue,
    );
  }
  return issue;
}
