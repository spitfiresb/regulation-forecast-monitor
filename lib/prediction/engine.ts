import { buildOutlook, OUTLOOK_VERSION } from "./outlook";
import { createHash } from "node:crypto";
import report from "@/data/evaluation/current.json";
import { type CatalogEntry, type Snapshot } from "../model";
import { formatDate, targetElapsed } from "../dates";
import {
  evaluationSchema,
  sixMonthsAfter,
  type Evaluation,
  type Prediction,
} from "./model";
export const currentEvaluation = () => evaluationSchema.parse(report);
export function estimate(cohort: Evaluation["cohort"], agency: string) {
  if (!cohort.cases) return null;
  const pooled = cohort.events / cohort.cases;
  const group = cohort.agencies[agency];
  return group && group.cases >= 30
    ? (group.events + cohort.k * pooled) / (group.cases + cohort.k)
    : pooled;
}
export function buildPrediction(
  entry: CatalogEntry,
  snapshot: Snapshot | null,
  issuedAt = new Date().toISOString(),
  evaluation = currentEvaluation(),
): Prediction {
  if (
    snapshot &&
    (snapshot.rule.id !== entry.id || snapshot.rule.rin !== entry.rin)
  )
    throw new Error("Prediction evidence belongs to another rule");
  const signals = snapshot?.signals ?? [];
  const has = (type: string) => signals.some((s) => s.signal_type === type);
  const stage = snapshot?.rule.stage ?? entry.stage;
  const features = {
    agency_code: entry.agency_code,
    stage,
    proposal_published: has("NPRM_PUBLISHED"),
    final_published: has("FINAL_RULE_PUBLISHED"),
    // The empirical cohort was collected from plain NPRM rows only.
    // Broader aliases help the outlook, but do not silently widen that model.
    has_scheduled_nprm: signals.some(
      (s) =>
        s.signal_type === "NPRM_SCHEDULED" &&
        /^Timetable:\s*NPRM\s*—/i.test(s.raw_wording),
    ),
  };
  const cutoff = snapshot?.synced_at ?? issuedAt;
  let target: Prediction["target"] =
    features.proposal_published || stage === "Final Rule Stage"
      ? "FINAL_RULE_PUBLISHED"
      : stage === "Proposed Rule Stage"
        ? "NPRM_PUBLISHED"
        : null;
  let status: Prediction["status"] = "insufficient_evidence";
  let probability: number | null = null;
  let reason =
    "Check official sources to establish publication status before estimating a chance.";
  if (snapshot) {
    if (has("REVIEW_REQUIRED")) {
      status = "review_required";
      reason =
        "These records contain an unsupported stage or publication that needs review.";
    } else if (features.final_published) {
      target = null;
      status = "not_applicable";
      reason =
        "A matching final rule is already published. Publication is a known event, not a prediction.";
    } else if (!target) {
      status = "not_applicable";
      reason =
        "This stage is outside the currently supported publication forecasts.";
    } else if (
      !has("FR_CHECK") ||
      snapshot.federal_register_checked_at !== snapshot.synced_at
    ) {
      reason =
        "The latest Federal Register check was incomplete. Earlier evidence does not establish current publication status.";
    } else if (Date.parse(issuedAt) - Date.parse(cutoff) > 86_400_000) {
      status = "stale";
      reason = "Refresh the official sources before issuing a new forecast.";
    } else if (target !== evaluation.target) {
      reason =
        "The six-month final-rule forecast does not yet have an evaluated historical cohort.";
    } else if (!features.has_scheduled_nprm) {
      reason =
        "No plain scheduled NPRM is established. This case does not match the historical cohort.";
    } else if (!evaluation.enabled) {
      reason = evaluation.reasons.join(" ");
    } else {
      probability = estimate(evaluation.cohort, entry.agency_code);
      if (probability !== null) {
        status = "experimental";
        reason =
          "Historical publication rate for comparable agency-and-stage cases, smoothed toward the pooled stage rate.";
      }
    }
  }
  const facts: Prediction["facts"] = [];
  const stageSignal =
    signals.find((s) =>
      ["PROPOSED_RULE_STAGE", "FINAL_RULE_STAGE"].includes(s.signal_type),
    ) ?? signals.find((s) => s.signal_type === "AGENDA_LISTED");
  if (stageSignal)
    facts.push({
      text: `The latest checked agenda lists ${stage}.`,
      evidence_ids: [stageSignal.id],
    });
  const nprm = signals.find((s) => s.signal_type === "NPRM_SCHEDULED");
  if (nprm?.date)
    facts.push({
      text: `The agency listed ${formatDate(nprm.date)} for an NPRM${targetElapsed(nprm.date, new Date(issuedAt)) ? "; that target has passed" : "; this is an agency target, not our forecast window"}.`,
      evidence_ids: [nprm.id],
    });
  const check = signals.find((s) => s.signal_type === "FR_CHECK");
  if (check)
    facts.push({
      text: features.final_published
        ? "A matching final publication was found."
        : features.proposal_published
          ? "A matching proposal was found."
          : `No matching proposal or final publication was found in the exact-RIN check dated ${formatDate(check.observed_at)}.`,
      evidence_ids: [
        check.id,
        ...signals
          .filter((s) =>
            ["NPRM_PUBLISHED", "FINAL_RULE_PUBLISHED"].includes(s.signal_type),
          )
          .map((s) => s.id),
      ],
    });
  const limitations = [
    "A publication forecast does not predict the final wording, effective date, or legal survival of a rule.",
    "Exact-RIN searches may miss documents without RIN metadata.",
    "Agenda targets are context; they do not change the cohort estimate unless included in the evaluated method.",
  ];
  const base = {
    rule_id: entry.id,
    rin: entry.rin,
    target,
    issued_at: issuedAt,
    evidence_cutoff: cutoff,
    window_end: sixMonthsAfter(issuedAt),
    status,
    probability,
    reason,
    method_version: OUTLOOK_VERSION,
    outlook: buildOutlook(entry, snapshot, issuedAt),
    evaluation_version: evaluation.version,
    evidence: signals,
    facts,
    limitations,
    features,
    evaluation,
  };
  return {
    id: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
    ...base,
  };
}
