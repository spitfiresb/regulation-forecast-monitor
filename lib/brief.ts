import baseline from "@/data/baseline.json";
import { type Snapshot } from "./model";
import { formatDate, targetElapsed } from "./dates";

// Human-reviewed explanation applies only to this exact verified abstract.
// A changed abstract must not silently inherit the old interpretation.
export function reviewedContext(data: Snapshot) {
  if (
    data.rule.summary.replace(/\s+/g, " ").trim() !==
    baseline.rule.summary.replace(/\s+/g, " ").trim()
  )
    return null;
  return {
    change:
      "CFPB is considering a backup way to calculate the average prime offer rate (APOR) when it does not publish its weekly APOR tables.",
    relevance:
      "Mortgage compliance and reporting teams use APOR as a benchmark when comparing a loan’s annual percentage rate (APR). The agenda identifies uses under both Regulation Z and Regulation C. A fallback method could affect how those comparisons are made when weekly tables are unavailable.",
  };
}

export function currentBrief(data: Snapshot, now: number) {
  const has = (type: string) =>
    data.signals.some((s) => s.signal_type === type);
  if (data.forecast.likelihood === "REVIEW REQUIRED")
    return "The official records need manual review before a simple status can be stated. See the evidence below.";
  if (has("FINAL_RULE_PUBLISHED"))
    return "A matching final rule was found in the Federal Register. Publication and effective dates are shown below; this agenda summary is not a summary of the final requirements.";
  if (has("NPRM_PUBLISHED"))
    return "A matching proposal was found in the Federal Register. Its publication does not establish that a final rule will follow.";
  if (has("FINAL_RULE_STAGE"))
    return "The agenda lists Final Rule Stage, but no matching final publication is established by the checked evidence. Current publication status and timing need confirmation.";
  const target =
    data.signals.find((s) => s.signal_type === "NPRM_SCHEDULED")?.date ?? null;
  const timing = target
    ? targetElapsed(target, new Date(now))
      ? `The agenda’s ${formatDate(target)} proposal target has passed; current timing is unconfirmed.`
      : `The agenda targets ${formatDate(target)} for a proposal; this is a planned date.`
    : "The checked agenda does not establish a proposal date.";
  const check = data.signals.find((s) => s.signal_type === "FR_CHECK");
  const publication = check
    ? `No matching proposal or final rule was found in the exact-RIN Federal Register check on ${formatDate(check.observed_at, true)}.`
    : "Federal Register publication status has not been verified.";
  return `${timing} ${publication}`;
}

export const proceduralLabels = {
  EARLY: "Listed in the agenda",
  DEVELOPING: "Proposal planned in the agenda",
  STRONG: "Proposal published",
  "HIGH SIGNAL": "Published comment deadline passed",
  "VERY HIGH SIGNAL": "Final rule planned in the agenda",
  FINALIZED: "Final rule published",
  "REVIEW REQUIRED": "Manual review needed",
} as const;
