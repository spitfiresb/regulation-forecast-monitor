import { createHash } from "node:crypto";
import { HISTORY_MONTHS, type Snapshot } from "./model";

// Calendar months, clamping the day at month-end (e.g. August 31 -> February 28).
export function historyCutoff(now = new Date()): string {
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - HISTORY_MONTHS);
  const end = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, end));
  return result.toISOString();
}

// Retrieval timestamps, comparison text, and date-bearing explanatory prose do
// not constitute a new version. Actual signals, forecast outcomes and source
// availability do. Keep this projection in sync with snapshot_content SQL.
function snapshotContent(snapshot: Snapshot) {
  const f = snapshot.forecast;
  return {
    rule: snapshot.rule,
    signals: snapshot.signals
      .map((s) => ({
        signal_type: s.signal_type,
        date: s.signal_type === "FR_CHECK" ? null : s.date,
        date_precision: s.date_precision,
        raw_wording: s.raw_wording,
        source_url: s.source_url,
        source_name: s.source_name,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    forecast: {
      likelihood: f.likelihood,
      confidence: f.confidence,
      expected_change: f.expected_change,
      summary_method: f.summary_method,
      next_action: f.next_action,
      expected_action_date: f.expected_action_date,
      final_rule_date: f.final_rule_date,
      effective_date: f.effective_date,
    },
    warnings: [...snapshot.warnings].sort(),
  };
}
export function snapshotFingerprint(snapshot: Snapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshotContent(snapshot)))
    .digest("hex");
}
