import { type Snapshot, type Signal } from "./model";
import { formatDate } from "./dates";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const isRegister = (signal: Signal) =>
  signal.source_name.startsWith("Federal Register");

// Compare official content, never retrieval timestamps or generated summaries.
export function compareSnapshots(
  current: Snapshot,
  previous?: Snapshot,
): Snapshot["comparison"] {
  if (!previous) return null;
  const changes: NonNullable<Snapshot["comparison"]>["changes"] = [];
  const add = (
    label: string,
    before: string,
    after: string,
    source = current.rule.source_url,
    oldSource = previous.rule.source_url,
  ) => {
    if (clean(before) !== clean(after))
      changes.push({
        label,
        before,
        after,
        source_url: source,
        previous_source_url: oldSource,
      });
  };
  add("Agenda stage", previous.rule.stage, current.rule.stage);
  add("Official abstract", previous.rule.summary, current.rule.summary);
  add("Official title", previous.rule.title, current.rule.title);
  add(
    "Affected CFR parts",
    [...previous.rule.cfr_citation].sort().join(", "),
    [...current.rule.cfr_citation].sort().join(", "),
  );
  add(
    "Agenda legal deadline",
    previous.rule.legal_deadline,
    current.rule.legal_deadline,
  );
  add(
    "Agenda edition",
    previous.rule.publication_id,
    current.rule.publication_id,
  );
  const target = (s: Snapshot) =>
    s.signals
      .filter((x) => x.signal_type === "NPRM_SCHEDULED")
      .map((x) => formatDate(x.date))
      .sort()
      .join(", ") || "Not listed";
  add("NPRM agenda target", target(previous), target(current));
  const incomplete =
    current.federal_register_checked_at !== current.synced_at ||
    !previous.federal_register_checked_at;
  if (!incomplete) {
    const publications = (s: Snapshot) =>
      s.signals.filter((x) => isRegister(x) && x.signal_type !== "FR_CHECK");
    const before = publications(previous),
      after = publications(current);
    const signature = (s: Signal) =>
      JSON.stringify([
        s.signal_type,
        s.date,
        clean(s.raw_wording),
        s.source_url,
      ]);
    for (const signal of after) {
      if (!before.some((old) => signature(old) === signature(signal))) {
        add(
          "Publication evidence added or updated",
          "Not present in the previous check",
          signal.raw_wording,
          signal.source_url,
          previous.signals.find((s) => s.signal_type === "FR_CHECK")
            ?.source_url,
        );
      }
    }
    for (const signal of before) {
      if (!after.some((next) => signature(next) === signature(signal))) {
        add(
          "Publication evidence no longer returned",
          signal.raw_wording,
          "Not returned in this check; this does not establish withdrawal or repeal.",
          current.signals.find((s) => s.signal_type === "FR_CHECK")?.source_url,
          signal.source_url,
        );
      }
    }
  }
  return { previous_checked_at: previous.synced_at, incomplete, changes };
}
