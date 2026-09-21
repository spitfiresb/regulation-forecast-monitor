import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { curatedExamples } from "../lib/activity/examples";
import type { ActivityCase } from "../lib/activity/model";

// Opt-in integration check: real sources and model calls, no canned responses.
const run = promisify(execFile);
const origin = new URL(process.argv[2] || "http://127.0.0.1:3000").origin;
const seen = new Set<string>();
let failures = 0;
const passes = process.argv[3] === "1" ? 1 : 2;
for (let pass = 1; pass <= passes; pass++) {
  for (const example of curatedExamples) {
    // Space live checks to avoid exhausting provider requests-per-minute limits.
    if (pass > 1 || example !== curatedExamples[0]) await setTimeout(60000);
    const start = Date.now();
    try {
      const { stdout } = await run(
        "curl",
        [
          "--fail-with-body",
          "--silent",
          "--show-error",
          "--max-time",
          "120",
          "-X",
          "POST",
          "-H",
          `Origin: ${origin}`,
          `${origin}/api/activity/${example.id}/assess?refresh=true`,
        ],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      const record: ActivityCase = JSON.parse(stdout);
      const ai = record.assessment.ai;
      const fresh =
        Date.parse(record.checked_at) >= start - 2000 &&
        !seen.has(record.fingerprint);
      seen.add(record.fingerprint);
      const success =
        record.id === example.id &&
        fresh &&
        ai?.status === "generated" &&
        ai.review?.approved &&
        !!ai.prediction;
      if (!success) failures++;
      console.log(
        JSON.stringify({
          pass,
          id: example.id,
          success,
          fresh,
          status: ai?.status,
          event: ai?.prediction?.event,
          reason: ai?.reason,
          attempts: ai?.review_attempts?.length,
          seconds: Math.round((Date.now() - start) / 1000),
        }),
      );
    } catch (error) {
      failures++;
      console.log(
        JSON.stringify({
          pass,
          id: example.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
console.log(
  `${curatedExamples.length * passes - failures}/${curatedExamples.length * passes} fresh forecasts passed.`,
);
if (failures) process.exitCode = 1;
