import { z } from "zod";
import { isIsoDay } from "../dates";
const day = z.string().refine(isIsoDay);
const officialUrl = z.url().refine((value) => {
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    ["www.federalregister.gov", "www.govinfo.gov"].includes(u.hostname)
  );
});
export const documentId = z.string().regex(/^\d{4}-[A-Z0-9]+$/i);
export const activityDocumentSchema = z.object({
  document_number: documentId,
  title: z.string(),
  type: z.string(),
  publication_date: day,
  html_url: officialUrl,
  pdf_url: officialUrl.nullable().optional(),
  action: z.string().nullable().optional(),
  abstract: z.string().nullable().optional(),
  dates: z.string().nullable().optional(),
  effective_on: day.nullable().optional(),
  comments_close_on: day.nullable().optional(),
  regulation_id_numbers: z.array(z.string()).default([]),
  docket_ids: z.array(z.string()).default([]),
  agencies: z
    .array(
      z.object({
        name: z.string().nullable().optional(),
        raw_name: z.string().optional(),
        id: z.number().nullable().optional(),
      }),
    )
    .default([]),
  cfr_references: z
    .array(z.object({ title: z.coerce.number(), part: z.string() }))
    .default([]),
});
export type ActivityDocument = z.infer<typeof activityDocumentSchema>;
export type EventKind =
  | "delay"
  | "withdrawal"
  | "comment_extension"
  | "correction"
  | "prerule"
  | "proposal"
  | "final"
  | "amendment"
  | "notice";
export type ActivityEvent = {
  kind: EventKind;
  label: string;
  document: ActivityDocument;
};
export type ActivityWindow = { from: string; to: string };
export type ActivitySearch = {
  entries: ActivityEvent[];
  window: ActivityWindow;
  next_page: number | null;
  page: number;
  checked_at: string;
  query: string;
};
export type StatusAssessment = {
  method: string;
  current_status: string;
  current_evidence: string[];
  next_status: string;
  forecast: string;
  basis: string[];
  alternatives: string[];
  evidence: string[];
  kind: "forecast" | "insufficient_evidence";
  timing: string;
  effective_date: string | null;
  effective_evidence: string | null;
};
export type ActivityCase = {
  id: string;
  selected: ActivityDocument;
  history: ActivityEvent[];
  related_excluded: number;
  history_complete: boolean;
  linkage: "rin" | "docket" | "title" | "document";
  limitations: string[];
  checked_at: string;
  window: ActivityWindow;
  assessment: StatusAssessment;
  summary: { text: string; method: "gemini" | "official-excerpt" };
  fingerprint: string;
};
// Search radius only. There is deliberately no six-month prediction deadline.
export function activityWindow(now = new Date()): ActivityWindow {
  const date = new Date(now);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 6);
  date.setUTCDate(
    Math.min(
      dayOfMonth,
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return {
    from: date.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}
export function inWindow(date: string, window: ActivityWindow) {
  return date >= window.from && date <= window.to;
}
