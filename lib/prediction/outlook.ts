import { type CatalogEntry, type Snapshot } from "../model";
import { formatDate, parseAgendaDate, targetElapsed } from "../dates";

export type Outlook = {
  kind: "inference" | "known" | "abstained";
  headline: string;
  basis: string;
  timing: string;
  watch_for: string;
  alternative: string;
  evidence_ids: string[];
};
export const OUTLOOK_VERSION = "publication-outlook-v2";
export function buildOutlook(
  entry: CatalogEntry,
  snapshot: Snapshot | null,
  now: string,
): Outlook {
  const signals = snapshot?.signals ?? [];
  const has = (type: string) => signals.some((s) => s.signal_type === type);
  const stage = snapshot?.rule.stage ?? entry.stage;
  const base = {
    evidence_ids: signals
      .filter((s) =>
        [
          "AGENDA_LISTED",
          "PROPOSED_RULE_STAGE",
          "FINAL_RULE_STAGE",
          "NPRM_PUBLISHED",
          "FINAL_RULE_PUBLISHED",
          "COMMENT_PERIOD_OPEN",
          "COMMENT_PERIOD_CLOSED",
          "NPRM_SCHEDULED",
          "REVIEW_REQUIRED",
          "FR_CHECK",
        ].includes(s.signal_type),
      )
      .map((s) => s.id),
    timing: "No supported publication-date estimate.",
    alternative: "The agency could delay, revise, or withdraw the action.",
  };
  if (
    !snapshot ||
    !has("FR_CHECK") ||
    snapshot.federal_register_checked_at !== snapshot.synced_at ||
    Date.parse(now) - Date.parse(snapshot.synced_at) > 86400000
  ) {
    return {
      ...base,
      kind: "abstained",
      headline: "Check current sources before forecasting.",
      basis:
        "Publication evidence is missing, incomplete, or more than a day old.",
      watch_for: "A successful check of the agenda and Federal Register.",
    };
  }
  if (has("REVIEW_REQUIRED"))
    return {
      ...base,
      kind: "abstained",
      headline: "The next action needs review.",
      basis: "The publication history does not support a simple progression.",
      watch_for:
        "Clarification of the withdrawal, amendment, or conflicting publications.",
    };
  if (has("FINAL_RULE_PUBLISHED"))
    return {
      ...base,
      kind: "known",
      headline: "A final rule has been published.",
      basis: "This is an observed publication, not a forecast.",
      timing: snapshot.forecast.effective_date
        ? `Published effective date: ${formatDate(snapshot.forecast.effective_date)}.`
        : "No effective date established in the checked evidence.",
      watch_for: "Any later amendment, delay, or withdrawal.",
      alternative: "Publication does not establish continued legal effect.",
    };
  if (
    entry.timetable.some((row) =>
      /direct final|interim final|supplemental|second nprm|next action undetermined/i.test(
        row.action,
      ),
    )
  )
    return {
      ...base,
      kind: "abstained",
      headline: "The next action is not clear enough to forecast.",
      basis:
        "The timetable describes an unusual or undetermined procedure rather than a standard next publication.",
      watch_for: "An agency notice clarifying the next action.",
    };
  const proposed = has("NPRM_PUBLISHED");
  const finalStage = stage === "Final Rule Stage";
  if (!proposed && !finalStage && stage !== "Proposed Rule Stage")
    return {
      ...base,
      kind: "abstained",
      headline: "No clear next publication is signaled.",
      basis: `The agenda lists ${stage}. That alone does not support predicting a proposal or final rule.`,
      watch_for:
        "A move into proposal or final-rule stage, or a published notice.",
    };
  const scheduled =
    !proposed && !finalStage
      ? signals.find((s) => s.signal_type === "NPRM_SCHEDULED")?.date
      : entry.timetable
          .filter((t) => /^(final rule|final action)$/i.test(t.action))
          .map((t) => parseAgendaDate(t.date).date)
          .filter((d): d is string => !!d)
          .sort()
          .at(-1);
  const timing = scheduled
    ? targetElapsed(scheduled, new Date(now))
      ? `The ${formatDate(scheduled)} agency target has passed. No reliable replacement date is available.`
      : `The agency targets ${formatDate(scheduled)}. We have not validated that timing.`
    : "No agency target is available for this publication. A date cannot yet be estimated reliably.";
  if (!proposed && !finalStage)
    return {
      ...base,
      timing,
      kind: "inference",
      headline: "A proposal is the next expected step.",
      basis:
        "The agency has placed this action in proposal stage; the checked RIN search found no published proposal.",
      watch_for: "A proposed rule published in the Federal Register.",
      alternative:
        "The proposal may be delayed or withdrawn. A proposal would not guarantee a final rule.",
    };
  if (has("COMMENT_PERIOD_OPEN"))
    return {
      ...base,
      timing,
      kind: "inference",
      headline: "Expect comment review before a final decision.",
      basis: "A proposal is published and its comment period is open.",
      watch_for:
        "The comment deadline, followed by a final decision or another proposal.",
    };
  return {
    ...base,
    timing,
    kind: "inference",
    headline: finalStage
      ? "A final rule is the next expected publication."
      : "A final decision is the next milestone to watch.",
    basis: finalStage
      ? "The agency lists this action in final-rule stage; no matching final rule was found."
      : "A proposal is published. That establishes progress, but does not establish that it will be finalized.",
    watch_for: "A final rule, revised proposal, or withdrawal notice.",
  };
}
