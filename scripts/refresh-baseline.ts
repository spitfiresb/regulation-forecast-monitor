// Explicit maintainer action only: replace the committed public-source snapshot.
import { writeFile } from "node:fs/promises";
import { collectSnapshot } from "../lib/sync";
const snapshot = await collectSnapshot();
if (snapshot.warnings.length)
  throw new Error(
    "Refusing to replace the baseline with a partially verified record.",
  );
await writeFile("data/baseline.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Baseline verified at ${snapshot.synced_at}`);
