import { formatDate, isIsoDay } from "../dates";
import {
  type ActivityDocument,
  type ActivityEvent,
  type StatusAssessment,
} from "./model";
export const ACTIVITY_METHOD = "research-event-agent-v4";
// Only an explicit present-tense change in DATES can supersede metadata.
// Earlier dates in a notice's chronological recital are not new effective dates.
export function publishedEffectiveDate(event: ActivityEvent) {
  const doc = event.document;
  const metadata = doc.effective_on ?? null;
  if (event.kind !== "delay") return { date: metadata, note: undefined };
  const text = (doc.dates ?? "").replace(/\s+/g, " ");
  const months =
    "January February March April May June July August September October November December".split(
      " ",
    );
  const pattern =
    /\b(?:is|are)\s+(?:(?:further|again)\s+)?(?:delayed|postponed|extended)\s+(?:until|to)\s+(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/gi;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return { date: metadata, note: undefined };
  const dates = matches.map(
    (match) =>
      `${match[3]}-${String(months.findIndex((m) => m.toLowerCase() === match[1].toLowerCase()) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`,
  );
  if (dates.some((date) => !isIsoDay(date)) || new Set(dates).size !== 1)
    return {
      date: null,
      note: "The publication's DATES text contains conflicting or invalid effective dates. No date was selected.",
    };
  return {
    date: dates[0],
    note:
      metadata && metadata !== dates[0]
        ? "The structured effective-date metadata conflicts with the publication's DATES text. The explicit new date in DATES is used here."
        : undefined,
  };
}

export function classifyDocument(d: ActivityDocument): ActivityEvent {
  // ACTION is authoritative for the purpose of this publication. Title alone
  // cannot distinguish an original rule from subsequent notices with the same title.
  const action = d.action ?? "";
  const text = `${action}. ${d.abstract ?? ""}`;
  let kind: ActivityEvent["kind"];
  if (/\b(withdrawal|withdrawn|withdrawing)\b/i.test(action))
    kind = "withdrawal";
  else if (
    /\b(comment|commenting)\b[^.]{0,70}\b(extend|extension|reopen)|\b(extend|extension|reopen)\w*\b[^.]{0,70}\bcomment/i.test(
      action,
    )
  )
    kind = "comment_extension";
  else if (/\bcorrection|correcting amendment/i.test(action))
    kind = "correction";
  else if (
    /\b(delay|delayed|delaying|postpon|extend|extending|extension|stay)\w*\b[^.]{0,100}\beffective|\beffective date\b[^.]{0,100}\b(delay|postpon|extend|extending|extension|stay)/i.test(
      text,
    )
  )
    kind = "delay";
  else if (
    /\bwithdraw(s|ing)?\b/i.test((d.abstract ?? "").split(/[.!?]/)[0]) &&
    /\b(rule|proposal|notice)\b/i.test(d.abstract ?? "")
  )
    kind = "withdrawal";
  else if (
    !["Rule", "RULE"].includes(d.type) &&
    /advance notice of proposed|\bANPRM\b|request for information|notice of inquiry/i.test(
      `${action} ${d.title}`,
    )
  )
    kind = "prerule";
  else if (["Proposed Rule", "PRORULE"].includes(d.type)) kind = "proposal";
  else if (["Rule", "RULE"].includes(d.type))
    kind = /\bamendment\b/i.test(action) ? "amendment" : "final";
  else kind = "notice";
  const labels = {
    delay: "Effective-date delay",
    withdrawal: "Withdrawal",
    comment_extension: "Comment-period update",
    correction: "Correction",
    prerule: "Pre-rule information gathering",
    proposal: "Proposed rule",
    final: /direct final/i.test(action) ? "Direct final rule" : "Final rule",
    amendment: "Amendment",
    notice: "Related notice",
  };
  return { kind, label: labels[kind], document: d };
}
export function regulatoryActivity(d: ActivityDocument) {
  return (
    ["Rule", "RULE", "Proposed Rule", "PRORULE"].includes(d.type) ||
    d.regulation_id_numbers.length > 0 ||
    ["delay", "withdrawal", "comment_extension", "correction"].includes(
      classifyDocument(d).kind,
    )
  );
}
const normalizedTitle = (d: ActivityDocument) =>
  d.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function sameProceeding(
  a: ActivityDocument,
  b: ActivityDocument,
): boolean {
  if (a.document_number === b.document_number) return true;
  const agency = a.agencies.some((x) =>
    b.agencies.some((y) => x.id != null && x.id === y.id),
  );
  if (!agency) return false;
  if (a.docket_ids.length && b.docket_ids.length)
    return a.docket_ids.some((id) => b.docket_ids.includes(id));
  return normalizedTitle(a) === normalizedTitle(b);
}
export function assessStatus(
  history: ActivityEvent[],
  complete: boolean,
  reliableIdentity: boolean,
  now: string,
): StatusAssessment {
  const ordered = [...history].sort(
    (a, b) =>
      b.document.publication_date.localeCompare(a.document.publication_date) ||
      b.document.document_number.localeCompare(a.document.document_number),
  );
  const latest = ordered[0];
  const refs = ordered.map((e) => e.document.document_number);
  const base: StatusAssessment = {
    method: ACTIVITY_METHOD,
    current_status: "Needs review",
    current_evidence: latest ? [refs[0]] : [],
    next_status: "Unresolved",
    forecast:
      "There is not enough verified history to predict the next status.",
    basis: [],
    alternatives: [],
    evidence: latest ? [refs[0]] : [],
    kind: "insufficient_evidence",
    timing: "No defensible date estimate.",
    effective_date: null,
    effective_evidence: null,
  };
  if (!latest) return base;
  if (!complete || !reliableIdentity)
    return {
      ...base,
      current_status: `${latest.label} observed; history incomplete`,
      basis: [
        !complete
          ? "Related publications could not all be checked."
          : "The documents could not be linked confidently to one proceeding.",
      ],
    };
  // Same-day mixed actions have no reliable order in date-only API metadata.
  if (
    ordered.some(
      (e) =>
        e.document.publication_date === latest.document.publication_date &&
        e.kind !== latest.kind,
    )
  )
    return {
      ...base,
      current_status: "Multiple same-day actions require review",
      basis: [
        "Publication dates alone do not establish which action supersedes the other.",
      ],
    };
  const doc = latest.document;
  if (latest.kind === "withdrawal")
    return {
      ...base,
      kind: "forecast",
      current_status: "Withdrawal published",
      next_status: "Inactive unless restarted",
      forecast: "No further progress is expected without a new agency action.",
      basis: ["The latest related publication withdraws the action."],
      alternatives: ["The agency may issue a replacement proposal."],
      timing: "No restart date established.",
    };
  if (["correction", "notice", "amendment"].includes(latest.kind))
    return {
      ...base,
      current_status: `${latest.label} published`,
      basis: [
        "The latest update requires interpretation before assigning a new status.",
      ],
      alternatives: [
        "The update may leave the prior status unchanged or modify it.",
      ],
    };
  const published = ["delay", "final"].includes(latest.kind)
    ? publishedEffectiveDate(latest)
    : { date: null, note: undefined };
  const effective = published.date;
  const dates = {
    effective_date: effective,
    effective_date_note: published.note,
    effective_evidence: effective ? doc.document_number : null,
  };
  if (latest.kind === "delay") {
    const firstNonDelay = ordered.findIndex(
      (e) => e.kind !== "delay" && e.kind !== "correction",
    );
    const delays = ordered
      .slice(0, firstNonDelay < 0 ? ordered.length : firstNonDelay)
      .filter((e) => e.kind === "delay");
    const original = ordered.find((e) => e.kind === "final");
    if (!original)
      return {
        ...base,
        ...dates,
        current_status: "Effective-date delay published",
        basis: [
          "The original final rule was not located in the linked history.",
        ],
      };
    const upcoming = effective && effective >= now.slice(0, 10);
    if (!upcoming)
      return {
        ...base,
        ...dates,
        current_status: effective
          ? "Delayed effective date has passed"
          : "Effectiveness delayed; new date unresolved",
        basis: [
          "A delay is established, but the checked record cannot establish current legal effect.",
        ],
        timing: effective
          ? `Last published effective date: ${formatDate(effective)}. This is not proof the rule is currently in force.`
          : "The latest delay does not provide a structured effective date.",
      };
    return {
      ...base,
      ...dates,
      kind: "forecast",
      current_status: "Published, but effectiveness delayed",
      next_status:
        delays.length >= 2
          ? "Another effective-date delay"
          : "Scheduled effectiveness",
      forecast:
        delays.length >= 2
          ? "Another delay is the leading scenario in this assessment."
          : "The rule is expected to reach its scheduled effective date, unless the agency intervenes.",
      basis: [
        `${delays.length} successive effective-date ${delays.length === 1 ? "delay is" : "delays are"} recorded.`,
        /adverse comment/i.test(
          ordered.map((e) => e.document.abstract).join(" "),
        )
          ? "The published history reports adverse comments."
          : "The latest notice continues postponement of the original rule.",
      ],
      evidence: [
        ...delays.map((e) => e.document.document_number),
        original.document.document_number,
      ],
      alternatives: [
        "The rule takes effect on the currently published date.",
        "The agency withdraws or replaces the rule.",
      ],
      timing: `The current published date is ${formatDate(effective)}. No further-delay date is predicted.`,
    };
  }
  if (latest.kind === "final")
    return {
      ...base,
      ...dates,
      kind:
        effective && effective >= now.slice(0, 10)
          ? "forecast"
          : "insufficient_evidence",
      current_status: "Final rule published",
      next_status:
        effective && effective >= now.slice(0, 10)
          ? "Scheduled effectiveness"
          : "No further transition established",
      forecast:
        effective && effective >= now.slice(0, 10)
          ? "The next expected transition is the published effective date."
          : "Publication is confirmed; no further status change can be predicted from this record alone.",
      basis: ["The latest linked publication is a final rule."],
      timing: effective
        ? `Published effective date: ${formatDate(effective)}. Later legal developments may affect implementation.`
        : "No effective date established in the publication metadata.",
      alternatives: ["A delay, withdrawal, or amendment could intervene."],
    };
  if (latest.kind === "prerule")
    return {
      ...base,
      kind: "forecast",
      current_status: "Pre-rule information gathering",
      next_status: "Further consultation or a proposal",
      forecast:
        "Information gathering is expected to precede any substantive proposal.",
      basis: [
        "The latest publication requests information or initiates an advance inquiry; it is not a substantive proposed rule.",
      ],
      timing: doc.comments_close_on
        ? `Published response deadline: ${formatDate(doc.comments_close_on)}. No proposal date is established.`
        : "No proposal date is established.",
      alternatives: [
        "The agency may take no further action after the inquiry.",
      ],
    };
  const proposal = ordered.find((e) => e.kind === "proposal");
  if (!proposal)
    return {
      ...base,
      current_status: "Comment update published",
      basis: ["The underlying proposal could not be linked."],
    };
  const deadline =
    doc.comments_close_on ??
    (latest.kind === "proposal" ? proposal.document.comments_close_on : null);
  const open = deadline && deadline >= now.slice(0, 10);
  return {
    ...base,
    kind: "forecast",
    current_status: open
      ? "Proposal open for comments"
      : deadline
        ? "Published comment deadline passed"
        : "Proposal published; next deadline unknown",
    next_status: open
      ? "Agency review of comments"
      : "Agency decision on the proposal",
    forecast: open
      ? "Comment review is the next expected status, before any final decision."
      : "An agency decision is the next expected development; finalization is not established.",
    basis: [
      latest.kind === "comment_extension"
        ? "The latest update changes the comment period."
        : "A substantive proposal is published.",
      deadline
        ? `The latest published comment deadline is ${formatDate(deadline)}.`
        : "No comment deadline is established in the checked metadata.",
    ],
    evidence: [
      ...new Set([doc.document_number, proposal.document.document_number]),
    ],
    timing: open
      ? `Comments are scheduled to close ${formatDate(deadline)}. No decision date is predicted.`
      : "No reliable date for the agency’s decision.",
    alternatives: [
      "A revised proposal or reopened comment period.",
      "Withdrawal or no further published action.",
    ],
  };
}
