import { load } from "cheerio";
import { z } from "zod";
import {
  activityDocumentSchema,
  documentId,
  type ActivityDocument,
  type ActivityEvent,
} from "./model";
import { officialJson, collectRelated } from "./client";
import { classifyDocument, sameProceeding } from "./analysis";

export const researchActionSchema = z
  .object({
    tool: z.enum(["read_publication", "find_comparables", "trace_comparable"]),
    document_number: z.string(),
    query: z.string().max(150),
    purpose: z.string().min(10).max(240),
  })
  .strict();
export type ResearchAction = z.infer<typeof researchActionSchema>;
export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  publication_date: string;
  role: "current_history" | "comparison";
  excerpt: string;
  full_text_read: boolean;
  text_url?: string;
};
export type ResearchStep = {
  tool: ResearchAction["tool"];
  purpose: string;
  query: string;
  document_number: string;
  status: "complete" | "failed";
  result: string;
  source_ids: string[];
};
export type ComparableCase = {
  document_number: string;
  title: string;
  complete: boolean;
  proposal_date: string | null;
  final_date: string | null;
  elapsed_days: number | null;
  evidence: string[];
};
export type ResearchReport = {
  steps: ResearchStep[];
  sources: ResearchSource[];
  comparisons: ComparableCase[];
  cutoff: string;
};

export function excerptFor(text: string, query: string, limit = 14000) {
  if (text.length <= limit) return text;
  const terms = query.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const ranked = paragraphs
    .map((text, index) => ({
      text,
      index,
      score: terms.reduce(
        (n, term) => n + (text.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Map<number, string>();
  let remaining = limit - 2500;
  for (const item of ranked) {
    if (!item.score || remaining < 500) break;
    const passage = item.text.slice(0, Math.min(4000, remaining));
    selected.set(item.index, passage);
    remaining -= passage.length;
  }
  return `[Selected excerpts from a longer document. Not the full text.]\n${text.slice(0, 2300)}\n\n${[
    ...selected,
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([i, p]) => `[Passage ${i + 1}] ${p}`)
    .join("\n\n")}`;
}

export function createResearch(
  history: ActivityEvent[],
  cutoff: string,
  deadline: number,
) {
  const current = history[0].document;
  const known = new Map(
    history.map((e) => [e.document.document_number, e.document]),
  );
  const own = new Set(known.keys());
  const report: ResearchReport = {
    steps: [],
    sources: [],
    comparisons: [],
    cutoff,
  };
  const bodies = new Map<string, string>();
  const textUrls = new Map<string, string>();
  function add(d: ActivityDocument, excerpt = d.abstract ?? "", read = false) {
    known.set(d.document_number, d);
    const prior = report.sources.find((s) => s.id === d.document_number);
    if (prior && !read) return;
    const source: ResearchSource = {
      id: d.document_number,
      title: d.title,
      url: d.html_url,
      publication_date: d.publication_date,
      role: own.has(d.document_number) ? "current_history" : "comparison",
      excerpt: read ? excerpt : excerpt.slice(0, 4000),
      full_text_read: read,
    };
    if (prior) Object.assign(prior, source);
    else report.sources.push(source);
  }
  for (const e of history) add(e.document);
  const timeout = () => Math.max(1, Math.min(12000, deadline - Date.now()));
  async function run(action: ResearchAction) {
    const step: ResearchStep = {
      ...action,
      status: "complete",
      result: "",
      source_ids: [],
    };
    try {
      if (Date.now() >= deadline)
        throw new Error("Research time budget reached.");
      if (action.tool === "find_comparables") {
        if (action.query.trim().length < 3)
          throw new Error("A focused search term is required.");
        const agency = current.agencies.find((a) => a.id != null)?.id;
        if (!agency) throw new Error("No agency identifier available.");
        const url = new URL(
          "https://www.federalregister.gov/api/v1/documents.json",
        );
        url.searchParams.set("conditions[term]", action.query);
        url.searchParams.set("conditions[agency_ids][]", String(agency));
        const earliest = history.at(-1)!.document.publication_date;
        const before = new Date(`${earliest}T00:00:00Z`);
        before.setUTCDate(before.getUTCDate() - 1);
        url.searchParams.set(
          "conditions[publication_date][lte]",
          before.toISOString().slice(0, 10),
        );
        url.searchParams.set(
          "conditions[publication_date][gte]",
          `${Number(cutoff.slice(0, 4)) - 15}-01-01`,
        );
        for (const type of ["RULE", "PRORULE"])
          url.searchParams.append("conditions[type][]", type);
        for (const field of [
          "document_number",
          "title",
          "type",
          "publication_date",
          "html_url",
          "abstract",
          "action",
          "agencies",
          "regulation_id_numbers",
          "docket_ids",
        ])
          url.searchParams.append("fields[]", field);
        url.searchParams.set("order", "relevance");
        url.searchParams.set("per_page", "8");
        const data = await officialJson(url.href, timeout());
        if (!Array.isArray(data.results) && data.count !== 0)
          throw new Error("Historical search returned an invalid result.");
        const docs = z
          .array(activityDocumentSchema)
          .parse(data.results ?? [])
          .filter(
            (d) =>
              d.publication_date < earliest &&
              d.agencies.some((a) => a.id === agency) &&
              !sameProceeding(current, d) &&
              !d.regulation_id_numbers.some((id) =>
                current.regulation_id_numbers.includes(id),
              ),
          );
        docs.forEach((d) => add(d));
        step.source_ids = docs.map((d) => d.document_number);
        step.result = `${docs.length} historical candidates found. Search results are selected examples, not a representative cohort.`;
        report.steps.push(step);
        return {
          ...step,
          candidates: docs.map((d) => ({
            id: d.document_number,
            title: d.title,
            action: d.action,
            date: d.publication_date,
            abstract: d.abstract,
          })),
        };
      }
      documentId.parse(action.document_number);
      const doc = known.get(action.document_number);
      if (!doc)
        throw new Error("Only retrieved document IDs can be inspected.");
      if (action.tool === "read_publication") {
        let body = bodies.get(doc.document_number);
        if (!body) {
          const metadata = await officialJson(
            `https://www.federalregister.gov/api/v1/documents/${doc.document_number}.json`,
            timeout(),
          );
          const url = new URL(metadata.raw_text_url);
          if (
            url.origin !== "https://www.federalregister.gov" ||
            !url.pathname.startsWith("/documents/full_text/text/") ||
            !url.pathname.endsWith(`/${doc.document_number}.txt`)
          )
            throw new Error("Official document text URL is unavailable.");
          const response = await fetch(url, {
            signal: AbortSignal.timeout(timeout()),
            redirect: "manual",
            cache: "no-store",
          });
          body = response.ok
            ? (await response.text()).replaceAll("\u0000", "")
            : "";
          let textUrl = url.href;
          if (
            body.length < 100 ||
            body.length > 2000000 ||
            /^\s*</.test(body)
          ) {
            // GovInfo publishes the same dated Federal Register document.
            // Construct this URL from validated identity, never from model input.
            textUrl = `https://www.govinfo.gov/content/pkg/FR-${doc.publication_date}/html/${doc.document_number}.htm`;
            const fallback = await fetch(textUrl, {
              signal: AbortSignal.timeout(timeout()),
              redirect: "manual",
              cache: "no-store",
            });
            if (!fallback.ok)
              throw new Error(
                `Official text sources unavailable (Federal Register ${response.status}; GovInfo ${fallback.status}).`,
              );
            const html = await fallback.text();
            if (html.length > 3000000)
              throw new Error("Official text exceeds the retrieval budget.");
            body = load(html)("pre").text().replaceAll("\u0000", "");
            if (!body.includes(`[FR Doc No: ${doc.document_number}]`))
              throw new Error(
                "GovInfo document identity could not be verified.",
              );
          }
          if (body.length < 100 || body.length > 2000000)
            throw new Error("Official text format was unexpected.");
          textUrls.set(doc.document_number, textUrl);
          bodies.set(doc.document_number, body);
        }
        const excerpt = excerptFor(body, action.query);
        add(doc, excerpt, true);
        report.sources.find((s) => s.id === doc.document_number)!.text_url =
          textUrls.get(doc.document_number);
        step.source_ids = [doc.document_number];
        step.result = `Read ${excerpt.length.toLocaleString("en-US")} characters of official text${body.length > excerpt.length ? " as selected excerpts" : ""}.`;
        report.steps.push(step);
        return { ...step, title: doc.title, excerpt };
      }
      if (own.has(doc.document_number))
        throw new Error(
          "Use this tool for a historical comparison, not the current proceeding.",
        );
      const related = await collectRelated(
        doc,
        cutoff,
        Math.min(deadline, Date.now() + 12000),
      );
      const events = related.documents
        .map(classifyDocument)
        .sort((a, b) =>
          a.document.publication_date.localeCompare(
            b.document.publication_date,
          ),
        );
      if (events.length > 40)
        throw new Error(
          "Comparison exceeds the 40-publication research budget. No interval inferred.",
        );
      events.forEach((e) => add(e.document));
      const proposal = events.find((e) => e.kind === "proposal");
      const final =
        proposal &&
        events.find(
          (e) =>
            e.kind === "final" &&
            e.document.publication_date > proposal.document.publication_date,
        );
      // A comparison measures the identified historical chain, not today's
      // status across all publications sharing its RIN. Unjoined later dockets
      // still block current-status assessments in collectRelated.
      const complete =
        related.retrieval_complete && related.linkage !== "title";
      const comparison: ComparableCase = {
        document_number: doc.document_number,
        title: doc.title,
        complete,
        proposal_date: proposal?.document.publication_date ?? null,
        final_date: final?.document.publication_date ?? null,
        elapsed_days:
          complete && proposal && final
            ? Math.round(
                (Date.parse(final.document.publication_date) -
                  Date.parse(proposal.document.publication_date)) /
                  86400000,
              )
            : null,
        evidence: events.map((e) => e.document.document_number),
      };
      report.comparisons.push(comparison);
      step.source_ids = comparison.evidence;
      step.result = complete
        ? `${events.length} linked publications checked${comparison.elapsed_days !== null ? `; ${comparison.elapsed_days} days from the earliest linked proposal to the first linked final rule` : "; no verified proposal-to-final interval"}.`
        : "Comparison history is incomplete or provisionally linked; no timing interval inferred.";
      report.steps.push(step);
      return {
        ...step,
        comparison,
        history: events.map((e) => ({
          id: e.document.document_number,
          date: e.document.publication_date,
          kind: e.kind,
          title: e.document.title,
          abstract: load(e.document.abstract ?? "")
            .text()
            .slice(0, 1500),
        })),
        limitations: related.limitations,
      };
    } catch (e) {
      step.status = "failed";
      step.result =
        e instanceof Error ? e.message : "Research source unavailable.";
      report.steps.push(step);
      return step;
    }
  }
  return { report, run };
}
