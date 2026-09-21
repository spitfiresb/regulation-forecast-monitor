import { type Forecast, type Rule, type Signal } from "./model";

export function officialExcerpt(summary: string): string {
  const sentences = summary.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [summary];
  return (
    sentences.find((s) => /considering.*contingency/i.test(s))?.trim() ??
    summary
  );
}
export function buildForecast(
  rule: Rule,
  signals: Signal[],
  updatedAt: string,
): Forecast {
  const ofType = (type: Signal["signal_type"]) =>
    signals.filter((s) => s.signal_type === type);
  const has = (type: Signal["signal_type"]) => ofType(type).length > 0;
  const latest = (type: Signal["signal_type"]) =>
    ofType(type).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  // A reopened/supplemental proposal's open window wins over an old closed window.
  const openComments = has("COMMENT_PERIOD_OPEN");
  const final = latest("FINAL_RULE_PUBLISHED");
  const latestProposal = latest("NPRM_PUBLISHED");
  const ambiguous =
    has("REVIEW_REQUIRED") ||
    ofType("FINAL_RULE_PUBLISHED").length > 1 ||
    !!(final && latestProposal && latestProposal.date! > final.date!);
  let likelihood: Forecast["likelihood"] = "EARLY";
  let reason =
    "This action appears in the Unified Agenda. Its inclusion alone does not establish that a proposed rule will be published.";
  let next = "Proposed rule (NPRM)";
  if (has("PROPOSED_RULE_STAGE")) {
    likelihood = "DEVELOPING";
    reason =
      "The latest Unified Agenda lists Proposed Rule Stage. This records the agency's stated plan; it does not establish that a proposal has been published or that a final rule will follow.";
  }
  if (has("NPRM_PUBLISHED")) {
    likelihood = "STRONG";
    next = openComments ? "Comment period closes" : "Next agency action";
    reason =
      "A proposed rule has been published in the Federal Register. Publication establishes a concrete proposal; finalization remains uncertain.";
  }
  if (has("COMMENT_PERIOD_CLOSED") && !openComments) {
    likelihood = "HIGH SIGNAL";
    next = "Not listed in the checked evidence";
    reason =
      "A published proposal's comment deadline has passed. The agency may consider comments before its next action; this does not guarantee a final rule.";
  }
  if (has("FINAL_RULE_STAGE")) {
    likelihood = "VERY HIGH SIGNAL";
    next = "Final rule";
    reason =
      "The Unified Agenda lists Final Rule Stage. An agenda stage is not a published final rule, and does not establish a probability of adoption.";
  }
  if (final) {
    likelihood = "FINALIZED";
    next = "Effective date";
    reason =
      "A matching final rule is published in the Federal Register. Any effective date shown is taken from that published record.";
  }
  if (ambiguous) {
    likelihood = "REVIEW REQUIRED";
    next = "Review official publications";
    reason =
      "A withdrawal, amendment, additional publication, or unrecognized stage needs manual review. The automatic forecast is paused to avoid implying a simple progression.";
  }
  const effective =
    !ambiguous && final
      ? (ofType("EFFECTIVE_DATE").find((s) => s.source_url === final.source_url)
          ?.date ?? null)
      : null;
  const nextDate = ambiguous
    ? null
    : final
      ? effective
      : has("FINAL_RULE_STAGE")
        ? null
        : openComments
          ? (latest("COMMENT_PERIOD_OPEN")?.date ?? null)
          : !has("NPRM_PUBLISHED")
            ? (latest("NPRM_SCHEDULED")?.date ?? null)
            : null;
  if (effective && effective <= updatedAt.slice(0, 10))
    next = "Monitor implementation";
  const check = latest("FR_CHECK");
  const reasons = [reason];
  if (!check)
    reasons.push(
      "Federal Register publication status has not been verified. No absence of a proposed or final rule is assumed.",
    );
  else if (!has("NPRM_PUBLISHED") && !final)
    reasons.push(
      `No matching proposed or final rule was found in the exact-RIN Federal Register lookup checked ${check.observed_at.slice(0, 10)}. Documents without RIN metadata may be missed.`,
    );
  const ids = (types: Signal["signal_type"][]) =>
    signals.filter((s) => types.includes(s.signal_type)).map((s) => s.id);
  return {
    id: `forecast-${rule.id}`,
    rule_id: rule.id,
    likelihood,
    // Retained for database compatibility; adoption confidence is not assessed.
    confidence: "Unassessed",
    expected_change: officialExcerpt(rule.summary),
    summary_method: "official-excerpt",
    next_action: next,
    expected_action_date: nextDate,
    final_rule_date: !ambiguous ? (final?.date ?? null) : null,
    effective_date: effective,
    reasoning: reasons,
    updated_at: updatedAt,
    evidence: {
      change: ids(["EXPECTED_CHANGE", "CFR_AFFECTED"]),
      likelihood: ids([
        "AGENDA_LISTED",
        "PROPOSED_RULE_STAGE",
        "NPRM_PUBLISHED",
        "COMMENT_PERIOD_OPEN",
        "COMMENT_PERIOD_CLOSED",
        "FINAL_RULE_STAGE",
        "FINAL_RULE_PUBLISHED",
        "FR_CHECK",
        "REVIEW_REQUIRED",
      ]),
      timing: ids([
        "NPRM_SCHEDULED",
        "NPRM_PUBLISHED",
        "COMMENT_PERIOD_OPEN",
        "COMMENT_PERIOD_CLOSED",
        "FINAL_RULE_STAGE",
        "FINAL_RULE_PUBLISHED",
        "EFFECTIVE_DATE",
        "LEGAL_DEADLINE",
        "FR_CHECK",
      ]),
    },
  };
}
