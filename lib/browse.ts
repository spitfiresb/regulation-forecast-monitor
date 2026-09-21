import { type CatalogEntry } from "./model";
import { formatDate, parseAgendaDate } from "./dates";

// Navigation groups based on the issuing agency, not legal applicability or
// an official government subject taxonomy. Prefixes include agency bureaus.
export const browseCategories = [
  {
    id: "finance",
    label: "Banking, lending & financial markets",
    prefixes: [
      "1505",
      "1557",
      "2590",
      "3038",
      "3048",
      "3052",
      "3064",
      "3133",
      "3139",
      "3170",
      "3235",
      "7100",
    ],
  },
  { id: "health", label: "Healthcare & medicine", prefixes: ["09", "2900"] },
  {
    id: "work",
    label: "Employment & benefits",
    prefixes: ["12", "3046", "3070", "3076", "3206", "3220"],
  },
  {
    id: "environment",
    label: "Environment & energy",
    prefixes: ["0331", "10", "19", "20", "3150", "3155", "3316", "3600"],
  },
  {
    id: "transport",
    label: "Transportation & travel",
    prefixes: ["21", "3072", "3147"],
  },
  { id: "food", label: "Food & agriculture", prefixes: ["05", "0910"] },
  {
    id: "consumer",
    label: "Consumer protection & communications",
    prefixes: ["3041", "3060", "3084", "3170"],
  },
  { id: "housing", label: "Housing & mortgages", prefixes: ["25", "3170"] },
] as const;
export function categoryFor(id: string) {
  return browseCategories.find((category) => category.id === id);
}
export const browseExamples = [
  {
    title: "Mortgage lending",
    query: "mortgage",
    description: "Explore changes involving home loans and lenders.",
  },
  {
    title: "Credit cards",
    query: '"credit card"',
    description: "Explore rulemakings involving cards and payments.",
  },
  {
    title: "Data privacy",
    query: "privacy",
    description:
      "Explore how agencies handle and protect personal information.",
  },
] as const;
export function agendaEdition(id: string) {
  const season =
    id.slice(4) === "10" ? "Fall" : id.slice(4) === "04" ? "Spring" : null;
  return season ? `${season} ${id.slice(0, 4)} agenda` : `Agenda edition ${id}`;
}
export function listedTimetable(entry: CatalogEntry, asOf: string) {
  const rows = entry.timetable
    .flatMap((row) => {
      const date = parseAgendaDate(row.date).date;
      return date ? [{ ...row, parsed: date }] : [];
    })
    .sort((a, b) => a.parsed.localeCompare(b.parsed));
  const next = rows.find(
    (row) => row.parsed >= asOf.slice(0, row.parsed.length),
  );
  const row = next ?? rows.at(-1);
  if (!row) return "No timetable date listed";
  const action = row.action === "NPRM" ? "Proposed rule" : row.action;
  return `Agenda timetable: ${action} · ${formatDate(row.parsed)}`;
}
