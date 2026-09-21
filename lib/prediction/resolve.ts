import { type Prediction } from "./model";
import { type Snapshot } from "../model";
export type Resolution = {
  prediction_id: string;
  checked_at: string;
  outcome: "occurred" | "pending" | "unresolved";
  evidence: Snapshot["signals"];
  reason: string;
};
export function resolvePrediction(
  issue: Prediction,
  snapshot: Snapshot | null,
  checkedAt: string,
): Resolution {
  if (
    snapshot &&
    (snapshot.rule.id !== issue.rule_id || snapshot.rule.rin !== issue.rin)
  )
    throw new Error("Resolution evidence belongs to another rule");
  const base = {
    prediction_id: issue.id,
    checked_at: checkedAt,
    evidence: snapshot?.signals ?? [],
  };
  if (
    !issue.target ||
    (issue.probability === null && issue.outlook?.kind !== "inference")
  )
    return {
      ...base,
      outcome: "unresolved",
      reason:
        "No evaluable publication outlook was issued for this assessment.",
    };
  if (
    !snapshot ||
    snapshot.signals.some((s) => s.signal_type === "REVIEW_REQUIRED")
  )
    return {
      ...base,
      outcome: "unresolved",
      reason: "Missing or ambiguous publication evidence needs review.",
    };
  const events = snapshot.signals.filter(
    (s) =>
      s.signal_type === issue.target &&
      s.date &&
      s.date > issue.evidence_cutoff.slice(0, 10) &&
      s.date <= issue.window_end.slice(0, 10) &&
      s.date <= checkedAt.slice(0, 10),
  );
  if (events.length === 1)
    return {
      ...base,
      evidence: events,
      outcome: "occurred",
      reason:
        "A matching target publication was observed inside the original forecast window.",
    };
  if (events.length > 1)
    return {
      ...base,
      outcome: "unresolved",
      reason: "Multiple target publications need relationship review.",
    };
  if (checkedAt < issue.window_end)
    return {
      ...base,
      outcome: "pending",
      reason: "The original forecast window has not ended.",
    };
  return {
    ...base,
    outcome: "unresolved",
    reason:
      "The window ended without a matched event in the saved evidence. A complete negative-outcome audit is required; an empty exact-RIN search is insufficient.",
  };
}
