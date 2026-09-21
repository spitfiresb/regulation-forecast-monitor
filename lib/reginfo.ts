import { load } from "cheerio";
import { createHash } from "node:crypto";
import { parseAgendaDate, isProposalAction } from "./dates";
import {
  DEFAULT_RULE,
  type RuleTarget,
  type Rule,
  type Signal,
  type SignalType,
} from "./model";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function makeSignal(
  type: SignalType,
  title: string,
  raw: string,
  url: string,
  observedAt: string,
  date: string | null = null,
  precision: Signal["date_precision"] = "unknown",
  source = "Unified Agenda · Reginfo",
  target: RuleTarget = DEFAULT_RULE,
): Signal {
  return {
    id: createHash("sha256")
      .update(
        JSON.stringify([
          target.id,
          type,
          raw,
          url,
          type === "FR_CHECK" ? null : date,
        ]),
      )
      .digest("hex"),
    rule_id: target.id,
    signal_type: type,
    title,
    description: raw,
    raw_wording: raw,
    source_url: url,
    source_name: source,
    observed_at: observedAt,
    date,
    date_precision: precision,
  };
}
export function discoverRuleUrl(
  html: string,
  target: RuleTarget = DEFAULT_RULE,
): string {
  const $ = load(html);
  const href = $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href")!)
    .find((href) => {
      try {
        const url = new URL(href, "https://www.reginfo.gov");
        return (
          url.pathname === "/public/do/eAgendaViewRule" &&
          url.searchParams.get("RIN") === target.rin &&
          url.hostname === "www.reginfo.gov" &&
          url.protocol === "https:"
        );
      } catch {
        return false;
      }
    });
  if (!href)
    throw new Error(
      "This RIN is absent from the current active agenda. The previous record is retained; manual source review is needed.",
    );
  return new URL(href, "https://www.reginfo.gov").href;
}
export function parseReginfo(
  html: string,
  sourceUrl: string,
  observedAt: string,
  target: RuleTarget = DEFAULT_RULE,
): { rule: Rule; signals: Signal[] } {
  const $ = load(html);
  const signal = (...args: Parameters<typeof makeSignal>) =>
    makeSignal(
      args[0],
      args[1],
      args[2],
      args[3],
      args[4],
      args[5],
      args[6],
      args[7],
      target,
    );
  const field = (label: string) => {
    const element = $("b, strong")
      .filter((_, el) => clean($(el).text()) === `${label}:`)
      .first();
    if (!element.length) return "";
    const cell = element.closest("td").clone();
    cell.find("b, strong").first().remove();
    return clean(cell.text());
  };
  if (field("RIN") !== target.rin)
    throw new Error(
      "Reginfo returned an unexpected RIN; existing data has been retained.",
    );
  const title = field("Title").replace(/^[●\s]+/, "");
  const summary = field("Abstract");
  const stage = field("Agenda Stage of Rulemaking");
  const cfr: string[] = field("CFR Citation").match(/\d+\s+CFR\s+\d+/g) ?? [];
  if (!title || !summary || !stage)
    throw new Error(
      "Required Reginfo fields are missing or changed; existing data has been retained.",
    );
  const rule: Rule = {
    id: target.id,
    rin: target.rin,
    title,
    summary,
    stage,
    cfr_citation: cfr,
    agency: field("Agency"),
    source_url: sourceUrl,
    publication_id: field("Publication ID"),
    legal_deadline: field("Legal Deadline") || "Not specified",
  };
  const signals = [
    signal(
      "AGENDA_LISTED",
      "Rulemaking listed in the Unified Agenda",
      `RIN: ${target.rin}; Publication ID: ${rule.publication_id}; Title: ${title}`,
      sourceUrl,
      observedAt,
    ),
    signal(
      "EXPECTED_CHANGE",
      "Agency describes the intended change",
      summary,
      sourceUrl,
      observedAt,
    ),
    signal(
      "CFR_AFFECTED",
      "Affected CFR parts",
      `CFR Citation: ${cfr.join("; ")}`,
      sourceUrl,
      observedAt,
    ),
    signal(
      "LEGAL_DEADLINE",
      "Legal deadline",
      `Legal Deadline: ${rule.legal_deadline}`,
      sourceUrl,
      observedAt,
    ),
  ];
  if (stage === "Proposed Rule Stage")
    signals.push(
      signal(
        "PROPOSED_RULE_STAGE",
        stage,
        `Agenda Stage of Rulemaking: ${stage}`,
        sourceUrl,
        observedAt,
      ),
    );
  else if (stage === "Final Rule Stage")
    signals.push(
      signal(
        "FINAL_RULE_STAGE",
        stage,
        `Agenda Stage of Rulemaking: ${stage}`,
        sourceUrl,
        observedAt,
      ),
    );
  else if (stage !== "Prerule Stage")
    signals.push(
      signal(
        "REVIEW_REQUIRED",
        "Agenda stage needs review",
        `Agenda Stage of Rulemaking: ${stage}`,
        sourceUrl,
        observedAt,
      ),
    );
  $("td[headers='TimetableAction']").each((_, el) => {
    const action = clean($(el).text());
    const row = $(el).closest("tr");
    const rawDate = clean(row.find("td[headers='TimetableDate']").text());
    const cite = clean(row.find("td[headers='FRC']").text());
    if (isProposalAction(action) && !cite) {
      const { date, precision } = parseAgendaDate(rawDate);
      signals.push(
        signal(
          "NPRM_SCHEDULED",
          "NPRM target in agency timetable",
          `Timetable: ${action} — ${rawDate}; FR Cite: ${cite || "not listed"}`,
          sourceUrl,
          observedAt,
          date,
          precision,
        ),
      );
    }
  });
  return { rule, signals };
}
