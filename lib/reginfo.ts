import { load } from "cheerio";
import { createHash } from "node:crypto";
import { parseAgendaDate } from "./dates";
import { RIN, RULE_ID, type Rule, type Signal, type SignalType } from "./model";

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
): Signal {
  return {
    id: createHash("sha256")
      .update(JSON.stringify([RULE_ID, type, raw, url, date]))
      .digest("hex"),
    rule_id: RULE_ID,
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
export function discoverRuleUrl(html: string): string {
  const $ = load(html);
  const href = $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href")!)
    .find((href) => {
      try {
        const url = new URL(href, "https://www.reginfo.gov");
        return (
          url.pathname === "/public/do/eAgendaViewRule" &&
          url.searchParams.get("RIN") === RIN &&
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
): { rule: Rule; signals: Signal[] } {
  const $ = load(html);
  const field = (label: string) => {
    const element = $("b, strong")
      .filter((_, el) => clean($(el).text()) === `${label}:`)
      .first();
    if (!element.length) return "";
    const cell = element.closest("td").clone();
    cell.find("b, strong").first().remove();
    return clean(cell.text());
  };
  if (field("RIN") !== RIN)
    throw new Error(
      "Reginfo returned an unexpected RIN; existing data has been retained.",
    );
  const title = field("Title").replace(/^[●\s]+/, "");
  const summary = field("Abstract");
  const stage = field("Agenda Stage of Rulemaking");
  const cfr: string[] = field("CFR Citation").match(/\d+\s+CFR\s+\d+/g) ?? [];
  if (!title || !summary || !stage || !cfr.includes("12 CFR 1026"))
    throw new Error(
      "Required Reginfo fields are missing or changed; existing data has been retained.",
    );
  const rule: Rule = {
    id: RULE_ID,
    rin: RIN,
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
    makeSignal(
      "AGENDA_LISTED",
      "Rulemaking listed in the Unified Agenda",
      `RIN: ${RIN}; Publication ID: ${rule.publication_id}; Title: ${title}`,
      sourceUrl,
      observedAt,
    ),
    makeSignal(
      "EXPECTED_CHANGE",
      "CFPB describes the intended change",
      summary,
      sourceUrl,
      observedAt,
    ),
    makeSignal(
      "CFR_AFFECTED",
      "Regulation Z is affected",
      `CFR Citation: ${cfr.join("; ")}`,
      sourceUrl,
      observedAt,
    ),
    makeSignal(
      "LEGAL_DEADLINE",
      "Legal deadline",
      `Legal Deadline: ${rule.legal_deadline}`,
      sourceUrl,
      observedAt,
    ),
  ];
  if (stage === "Proposed Rule Stage")
    signals.push(
      makeSignal(
        "PROPOSED_RULE_STAGE",
        stage,
        `Agenda Stage of Rulemaking: ${stage}`,
        sourceUrl,
        observedAt,
      ),
    );
  else if (stage === "Final Rule Stage")
    signals.push(
      makeSignal(
        "FINAL_RULE_STAGE",
        stage,
        `Agenda Stage of Rulemaking: ${stage}`,
        sourceUrl,
        observedAt,
      ),
    );
  else if (stage !== "Prerule Stage")
    signals.push(
      makeSignal(
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
    if (/^NPRM$/i.test(action) && !cite) {
      const { date, precision } = parseAgendaDate(rawDate);
      signals.push(
        makeSignal(
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
