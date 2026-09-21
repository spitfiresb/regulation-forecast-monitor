import { z } from "zod";

const RIN = "3170-AB57";
export const RULE_ID = "apor-contingency";
export const HISTORY_MONTHS = 6;
export const ruleIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
export const rinSchema = z.string().regex(/^\d{4}-[A-Z0-9]{4}$/);
export const ruleTargetSchema = z.object({
  id: ruleIdSchema,
  rin: rinSchema,
  agency_code: z.string().regex(/^\d{4}$/),
});
export type RuleTarget = z.infer<typeof ruleTargetSchema>;
export const DEFAULT_RULE: RuleTarget = {
  id: RULE_ID,
  rin: RIN,
  agency_code: "3170",
};
export function ruleIdForRin(rin: string): string {
  rinSchema.parse(rin);
  return rin === RIN ? RULE_ID : rin.toLowerCase();
}
export function agendaIndexFor(target: RuleTarget): string {
  ruleTargetSchema.parse(target);
  return `https://www.reginfo.gov/public/do/eAgendaMain?agencyCd=${target.agency_code}&currentPub=true&operation=OPERATION_GET_AGENCY_RULE_LIST&showStage=active`;
}
export function federalRegisterApiFor(target: RuleTarget): string {
  ruleTargetSchema.parse(target);
  return `https://www.federalregister.gov/api/v1/documents.json?conditions%5Bregulation_id_number%5D=${target.rin}&per_page=100&order=newest`;
}

const signalTypes = [
  "AGENDA_LISTED",
  "EXPECTED_CHANGE",
  "CFR_AFFECTED",
  "LEGAL_DEADLINE",
  "PROPOSED_RULE_STAGE",
  "NPRM_SCHEDULED",
  "NPRM_PUBLISHED",
  "COMMENT_PERIOD_OPEN",
  "COMMENT_PERIOD_CLOSED",
  "FINAL_RULE_STAGE",
  "FINAL_RULE_PUBLISHED",
  "EFFECTIVE_DATE",
  "FR_CHECK",
  "REVIEW_REQUIRED",
] as const;
export type SignalType = (typeof signalTypes)[number];
export const signalSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  signal_type: z.enum(signalTypes),
  date: z.string().nullable(),
  date_precision: z.enum(["day", "month", "unknown"]),
  title: z.string(),
  description: z.string(),
  raw_wording: z.string(),
  source_url: z.url(),
  source_name: z.string(),
  observed_at: z.iso.datetime(),
});
export type Signal = z.infer<typeof signalSchema>;
const ruleSchema = z.object({
  id: ruleIdSchema,
  rin: rinSchema,
  title: z.string(),
  agency: z.string(),
  cfr_citation: z.array(z.string()),
  stage: z.string(),
  summary: z.string(),
  source_url: z.url(),
  publication_id: z.string(),
  legal_deadline: z.string(),
});
export type Rule = z.infer<typeof ruleSchema>;
const forecastLevels = [
  "EARLY",
  "DEVELOPING",
  "STRONG",
  "HIGH SIGNAL",
  "VERY HIGH SIGNAL",
  "FINALIZED",
  "REVIEW REQUIRED",
] as const;
const forecastSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  likelihood: z.enum(forecastLevels),
  confidence: z.enum(["Low", "Medium", "High", "Confirmed", "Unassessed"]),
  expected_change: z.string(),
  summary_method: z.enum(["official-excerpt", "gemini"]),
  summary_metadata: z
    .object({
      model: z.string(),
      prompt_version: z.string(),
      input_hash: z.string(),
    })
    .optional(),
  next_action: z.string(),
  expected_action_date: z.string().nullable(),
  final_rule_date: z.string().nullable(),
  effective_date: z.string().nullable(),
  reasoning: z.array(z.string()),
  updated_at: z.iso.datetime(),
  evidence: z.object({
    change: z.array(z.string()),
    likelihood: z.array(z.string()),
    timing: z.array(z.string()),
  }),
});
export type Forecast = z.infer<typeof forecastSchema>;
const comparisonSchema = z.object({
  previous_checked_at: z.iso.datetime(),
  incomplete: z.boolean(),
  changes: z.array(
    z.object({
      label: z.string(),
      before: z.string(),
      after: z.string(),
      source_url: z.url(),
      previous_source_url: z.url(),
    }),
  ),
});
export const snapshotSchema = z
  .object({
    rule: ruleSchema,
    signals: z.array(signalSchema),
    forecast: forecastSchema,
    synced_at: z.iso.datetime(),
    federal_register_checked_at: z.iso.datetime().nullable(),
    warnings: z.array(z.string()),
    comparison: comparisonSchema.nullable().default(null),
  })
  .superRefine((snapshot, ctx) => {
    if (
      snapshot.forecast.id !== `forecast-${snapshot.rule.id}` ||
      snapshot.forecast.rule_id !== snapshot.rule.id ||
      snapshot.signals.some((s) => s.rule_id !== snapshot.rule.id)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Snapshot contains records belonging to another rule",
      });
    }
    const ids = new Set(snapshot.signals.map((s) => s.id));
    if (
      ids.size !== snapshot.signals.length ||
      Object.values(snapshot.forecast.evidence)
        .flat()
        .some((id) => !ids.has(id))
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Snapshot evidence must reference unique signals in this snapshot",
      });
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export type DashboardData = Snapshot & {
  storage: "supabase" | "local" | "snapshot";
  storage_warning?: string;
  as_of: number;
};

// Catalog entries are source records, not verified forecasts. A rulemaking can
// affect multiple CFR parts; those are references, not child rulemakings.
export const catalogEntrySchema = z.object({
  id: ruleIdSchema,
  rin: rinSchema,
  agency: z.string().min(1),
  agency_code: z.string().regex(/^\d{4}$/),
  title: z.string().min(1),
  summary: z.string(),
  stage: z.string(),
  cfr_citation: z.array(z.string()),
  publication_id: z.string().regex(/^\d{6}$/),
  source_url: z.url(),
  legal_deadline: z.string(),
  timetable: z.array(
    z.object({ action: z.string(), date: z.string(), fr_citation: z.string() }),
  ),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export const catalogSchema = z
  .object({
    publication_id: z.string().regex(/^\d{6}$/),
    source_url: z.url(),
    imported_at: z.iso.datetime(),
    entries: z.array(catalogEntrySchema).min(1),
  })
  .refine(
    (c) =>
      new Set(c.entries.map((r) => r.rin)).size === c.entries.length &&
      c.entries.every((r) => r.publication_id === c.publication_id),
    "Catalog must contain unique RINs from one edition",
  );
export type Catalog = z.infer<typeof catalogSchema>;
