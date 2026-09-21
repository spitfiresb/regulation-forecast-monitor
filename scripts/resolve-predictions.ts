import env from "@next/env";
import { supabase } from "../lib/storage";
import { predictionSchema } from "../lib/prediction/model";
import { getSnapshot } from "../lib/repository";
import { resolvePrediction } from "../lib/prediction/resolve";
env.loadEnvConfig(process.cwd());
const db = supabase();
if (!db)
  throw new Error(
    "This maintenance command requires the configured Supabase ledger.",
  );
let count = 0;
for (let offset = 0; ; offset += 100) {
  const { data, error } = await db
    .from("prediction_issues")
    .select("payload")
    .order("id")
    .range(offset, offset + 99);
  if (error) throw new Error("Prediction ledger could not be read");
  for (const row of data) {
    const issue = predictionSchema.parse(row.payload);
    if (issue.probability === null && issue.outlook?.kind !== "inference")
      continue;
    const resolution = resolvePrediction(
      issue,
      await getSnapshot(issue.rule_id),
      new Date().toISOString(),
    );
    const { error } = await db
      .from("prediction_resolutions")
      .insert(resolution);
    if (error) throw new Error("Resolution could not be saved");
    count++;
  }
  if (data.length < 100) break;
}
console.log(
  JSON.stringify({
    assessed: count,
    note: "Uses saved publication evidence. Unobserved events after the horizon remain unresolved until a negative-outcome audit.",
  }),
);
