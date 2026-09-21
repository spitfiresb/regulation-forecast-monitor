import { z } from "zod";

export const RIN = "3170-AB57";
export const RULE_ID = "apor-contingency";
export const AGENDA_INDEX =
  "https://www.reginfo.gov/public/do/eAgendaMain?agencyCd=3170&currentPub=true&operation=OPERATION_GET_AGENCY_RULE_LIST&showStage=active";
export const FR_API =
  "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bregulation_id_number%5D=3170-AB57&per_page=100&order=newest";

export const signalTypes = [
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
export const ruleSchema = z.object({
  id: z.string(),
  rin: z.literal(RIN),
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
export const forecastLevels = [
  "EARLY",
  "DEVELOPING",
  "STRONG",
  "HIGH SIGNAL",
  "VERY HIGH SIGNAL",
  "FINALIZED",
  "REVIEW REQUIRED",
] as const;
export const forecastSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  likelihood: z.enum(forecastLevels),
  confidence: z.enum(["Low", "Medium", "High", "Confirmed", "Unassessed"]),
  expected_change: z.string(),
  summary_method: z.enum(["official-excerpt", "gemini"]),
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
export const snapshotSchema = z.object({
  rule: ruleSchema,
  signals: z.array(signalSchema),
  forecast: forecastSchema,
  synced_at: z.iso.datetime(),
  federal_register_checked_at: z.iso.datetime().nullable(),
  warnings: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type DashboardData = Snapshot & {
  storage: "supabase" | "local" | "snapshot";
  storage_warning?: string;
  as_of: number;
};
