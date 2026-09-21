import { z } from "zod";
import { signalSchema } from "../model";
export const targetSchema = z.enum(["NPRM_PUBLISHED", "FINAL_RULE_PUBLISHED"]);
export type PredictionTarget = z.infer<typeof targetSchema>;
export const evaluationSchema = z.object({
  version: z.string(),
  created_at: z.string(),
  status: z.enum(["preliminary", "evaluated"]),
  target: targetSchema,
  method: z.string(),
  enabled: z.boolean(),
  reasons: z.array(z.string()),
  counts: z.object({
    training: z.number(),
    development: z.number(),
    test: z.number(),
    test_events: z.number(),
    unresolved: z.number(),
  }),
  metrics: z.object({
    brier: z.number().nullable(),
    baseline_brier: z.number().nullable(),
    calibration: z.array(
      z.object({
        mean_prediction: z.number(),
        event_rate: z.number(),
        count: z.number(),
      }),
    ),
  }),
  cohort: z.object({
    events: z.number(),
    cases: z.number(),
    k: z.number(),
    agencies: z.record(
      z.string(),
      z.object({ events: z.number(), cases: z.number() }),
    ),
  }),
  periods: z.object({
    training_end: z.string().nullable(),
    test_start: z.string().nullable(),
    test_end: z.string().nullable(),
  }),
  sources: z.array(z.object({ url: z.url(), label: z.string() })),
  limitations: z.array(z.string()),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export const predictionSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  rin: z.string(),
  target: targetSchema.nullable(),
  issued_at: z.string(),
  evidence_cutoff: z.string(),
  window_end: z.string(),
  status: z.enum([
    "experimental",
    "insufficient_evidence",
    "review_required",
    "not_applicable",
    "stale",
  ]),
  probability: z.number().min(0).max(1).nullable(),
  reason: z.string(),
  outlook: z
    .object({
      kind: z.enum(["inference", "known", "abstained"]),
      headline: z.string(),
      basis: z.string(),
      timing: z.string(),
      watch_for: z.string(),
      alternative: z.string(),
      evidence_ids: z.array(z.string()),
    })
    .optional(),
  method_version: z.string(),
  evaluation_version: z.string(),
  evidence: z.array(signalSchema),
  facts: z.array(
    z.object({ text: z.string(), evidence_ids: z.array(z.string()) }),
  ),
  limitations: z.array(z.string()),
  features: z.object({
    agency_code: z.string(),
    stage: z.string(),
    proposal_published: z.boolean(),
    final_published: z.boolean(),
    has_scheduled_nprm: z.boolean(),
  }),
  evaluation: evaluationSchema,
});
export type Prediction = z.infer<typeof predictionSchema>;
export const targetName = (target: PredictionTarget | null) =>
  target === "NPRM_PUBLISHED"
    ? "Publication of a proposed rule"
    : target === "FINAL_RULE_PUBLISHED"
      ? "Publication of a final rule"
      : "No supported publication forecast";
export function sixMonthsAfter(timestamp: string) {
  const d = new Date(timestamp);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 6);
  d.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
