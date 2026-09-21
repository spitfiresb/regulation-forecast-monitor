import { z } from "zod";
import { isIsoDay } from "./dates";
import { RIN, FR_API, type Signal } from "./model";
import { makeSignal } from "./reginfo";

const day = z.string().refine(isIsoDay);
export const frDocumentSchema = z.object({
  document_number: z.string(),
  title: z.string(),
  type: z.string(),
  html_url: z.url(),
  publication_date: day,
  abstract: z.string().nullable().optional(),
  regulation_id_numbers: z.array(z.string()),
  comments_close_on: day.nullable().optional(),
  effective_on: day.nullable().optional(),
});
export type FRDocument = z.infer<typeof frDocumentSchema>;
export const frSearchSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: z.array(z.object({ document_number: z.string() })).default([]),
    next_page_url: z.string().nullable().optional(),
  })
  .refine(
    (x) => x.results.length === x.count && !x.next_page_url,
    "Incomplete Federal Register results; refusing a partial publication check.",
  );

export function normalizeFederalRegister(
  documents: FRDocument[],
  observedAt: string,
): Signal[] {
  const today = observedAt.slice(0, 10);
  const docs = documents
    .map((d) => frDocumentSchema.parse(d))
    .filter(
      (d) =>
        d.regulation_id_numbers.includes(RIN) && d.publication_date <= today,
    );
  const signals: Signal[] = [];
  for (const doc of docs) {
    const url = new URL(doc.html_url);
    if (
      url.protocol !== "https:" ||
      !["www.federalregister.gov", "www.govinfo.gov"].includes(url.hostname)
    )
      throw new Error("Unexpected official document URL");
    const raw = `${doc.type}: ${doc.title}. Published: ${doc.publication_date}. Document: ${doc.document_number}.${doc.abstract ? ` ${doc.abstract}` : ""}`;
    const signal = (
      type: Signal["signal_type"],
      title: string,
      wording: string,
      date: string,
    ) =>
      makeSignal(
        type,
        title,
        wording,
        doc.html_url,
        observedAt,
        date,
        "day",
        "Federal Register",
      );
    if (
      /withdraw|resciss|correction|delay of effective|delaying.*effective/i.test(
        doc.title,
      )
    ) {
      signals.push(
        signal(
          "REVIEW_REQUIRED",
          "Publication requires manual review",
          raw,
          doc.publication_date,
        ),
      );
      continue;
    }
    if (["Proposed Rule", "PRORULE"].includes(doc.type)) {
      signals.push(
        signal(
          "NPRM_PUBLISHED",
          "Proposed rule published",
          raw,
          doc.publication_date,
        ),
      );
      if (doc.comments_close_on) {
        const closed = doc.comments_close_on < today;
        signals.push(
          signal(
            closed ? "COMMENT_PERIOD_CLOSED" : "COMMENT_PERIOD_OPEN",
            closed
              ? "Published comment deadline has passed"
              : "Public comment window",
            `Comments close on: ${doc.comments_close_on}. ${raw}`,
            doc.comments_close_on,
          ),
        );
      }
    } else if (["Rule", "RULE"].includes(doc.type)) {
      signals.push(
        signal(
          "FINAL_RULE_PUBLISHED",
          "Final rule published",
          raw,
          doc.publication_date,
        ),
      );
      if (doc.effective_on)
        signals.push(
          signal(
            "EFFECTIVE_DATE",
            "Published effective date",
            `Effective on: ${doc.effective_on}. ${raw}`,
            doc.effective_on,
          ),
        );
    } else {
      signals.push(
        signal(
          "REVIEW_REQUIRED",
          "Additional publication needs review",
          raw,
          doc.publication_date,
        ),
      );
    }
  }
  const counts = {
    proposed: signals.filter((s) => s.signal_type === "NPRM_PUBLISHED").length,
    final: signals.filter((s) => s.signal_type === "FINAL_RULE_PUBLISHED")
      .length,
  };
  signals.push(
    makeSignal(
      "FR_CHECK",
      "Federal Register publication check",
      `Exact RIN lookup: ${RIN}. Matching published documents: ${docs.length}. Proposed rules: ${counts.proposed}. Final rules: ${counts.final}. This RIN lookup may miss documents without RIN metadata.`,
      FR_API,
      observedAt,
      today,
      "day",
      "Federal Register API",
    ),
  );
  return signals;
}
