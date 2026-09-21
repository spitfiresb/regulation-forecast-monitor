import {
  activityDocumentSchema,
  activityWindow,
  inWindow,
  type ActivityDocument,
  type ActivitySearch,
} from "./model";
import {
  classifyDocument,
  regulatoryActivity,
  sameProceeding,
} from "./analysis";
const BASE = "https://www.federalregister.gov/api/v1/documents";
const fields = [
  "document_number",
  "title",
  "type",
  "publication_date",
  "html_url",
  "pdf_url",
  "action",
  "abstract",
  "dates",
  "effective_on",
  "comments_close_on",
  "regulation_id_numbers",
  "docket_ids",
  "agencies",
  "cfr_references",
];
export async function officialJson(url: string) {
  const u = new URL(url);
  if (
    u.origin !== "https://www.federalregister.gov" ||
    !u.pathname.startsWith("/api/v1/documents")
  )
    throw new Error("Unexpected source URL");
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "RegulatoryForecastMonitor/2.0",
      Accept: "application/json",
    },
  });
  if (!response.ok)
    throw new Error(
      `Federal Register returned HTTP ${response.status}. Try again.`,
    );
  return response.json();
}
function searchUrl(params: Record<string, string>, page: number, size: number) {
  const u = new URL(`${BASE}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (const field of fields) u.searchParams.append("fields[]", field);
  u.searchParams.set("page", String(page));
  u.searchParams.set("per_page", String(size));
  return u.href;
}
export async function getDocument(id: string): Promise<ActivityDocument> {
  return activityDocumentSchema.parse(
    await officialJson(`${BASE}/${encodeURIComponent(id)}.json`),
  );
}
// A bounded query cache reduces repeated requests while typing. The key includes
// today's date so yesterday's six-month radius can never leak into today's search.
const searches = new Map<string, { at: number; result: ActivitySearch }>();
export async function searchActivity(
  query: string,
  page = 1,
  now = new Date(),
): Promise<ActivitySearch> {
  const window = activityWindow(now);
  const key = JSON.stringify([query, page, window]);
  const cached = searches.get(key);
  if (cached && Date.now() - cached.at < 60000) return cached.result;
  const params: Record<string, string> = {
    "conditions[publication_date][gte]": window.from,
    "conditions[publication_date][lte]": window.to,
    "conditions[type][]": "RULE",
    order: query.trim() ? "relevance" : "newest",
  };
  // Encode multiple allowed publication types, including RIN-linked notices.
  delete params["conditions[type][]"];
  if (query.trim()) params["conditions[term]"] = query.trim();
  const url = new URL(searchUrl(params, page, 20));
  for (const type of ["RULE", "PRORULE", "NOTICE"])
    url.searchParams.append("conditions[type][]", type);
  const data = await officialJson(url.href);
  if (!Array.isArray(data.results) && data.count !== 0)
    throw new Error("Invalid activity response");
  const documents = (data.results ?? []).map((raw: unknown) =>
    activityDocumentSchema.parse(raw),
  ) as ActivityDocument[];
  const result: ActivitySearch = {
    entries: documents
      .filter(
        (d) => inWindow(d.publication_date, window) && regulatoryActivity(d),
      )
      .map(classifyDocument),
    window,
    page,
    query,
    checked_at: now.toISOString(),
    next_page: data.next_page_url ? page + 1 : null,
  };
  if (searches.size > 100) searches.clear();
  searches.set(key, { at: Date.now(), result });
  return result;
}
export async function collectRelated(
  selected: ActivityDocument,
  today: string,
) {
  const lookup = selected.regulation_id_numbers.length
    ? "rin"
    : selected.docket_ids.length
      ? "docket"
      : "title";
  const queries =
    lookup === "rin"
      ? selected.regulation_id_numbers.map((rin) => ({
          "conditions[regulation_id_number]": rin,
        }))
      : lookup === "docket"
        ? selected.docket_ids.map((docket) => ({
            "conditions[term]": `"${docket}"`,
          }))
        : [{ "conditions[term]": `"${selected.title.replaceAll('"', "")}"` }];
  const documents = new Map<string, ActivityDocument>([
    [selected.document_number, selected],
  ]);
  let complete = true;
  const limitations: string[] = [];
  const started = Date.now();
  for (const query of queries) {
    if (Date.now() - started > 60000) {
      complete = false;
      limitations.push(
        "The source lookup exceeded its time budget; history is incomplete.",
      );
      break;
    }
    let found = 0;
    let count: number | undefined;
    try {
      for (let page = 1; page <= 10; page++) {
        if (Date.now() - started > 60000) {
          complete = false;
          break;
        }
        const data = await officialJson(
          searchUrl(
            {
              ...query,
              "conditions[publication_date][lte]": today,
              order: "newest",
            },
            page,
            100,
          ),
        );
        if (!Number.isInteger(data.count))
          throw new Error("Invalid history count");
        if (count != null && count !== data.count)
          throw new Error("History changed during pagination");
        count = data.count;
        for (const raw of data.results ?? []) {
          const d = activityDocumentSchema.parse(raw);
          if (d.publication_date <= today) documents.set(d.document_number, d);
          found++;
        }
        if (!data.next_page_url) {
          if (found !== count) complete = false;
          break;
        }
        if (page === 10) complete = false;
      }
    } catch {
      complete = false;
      limitations.push(
        "Some historical publications could not be retrieved. The next-status forecast is withheld.",
      );
    }
  }
  const all = [...documents.values()];
  const linked = all.filter((d) => sameProceeding(selected, d));
  const excluded = all.length - linked.length;
  const unresolvedLater = all.some(
    (d) =>
      !sameProceeding(selected, d) &&
      d.publication_date >= selected.publication_date,
  );
  if (excluded)
    limitations.push(
      `${excluded} identifier matches were not joined because their docket or agency/title did not establish the same proceeding.`,
    );
  if (lookup === "title")
    limitations.push(
      "No RIN or docket identifier is available. Title matches are provisional; no status forecast is issued.",
    );
  limitations.push(
    "Identifier searches can miss publications with absent or incorrect metadata. Court orders and unpublished agency actions are outside this source check.",
  );
  return {
    documents: linked,
    complete: complete && !unresolvedLater,
    linkage: lookup as "rin" | "docket" | "title",
    excluded,
    limitations,
  };
}
