import { z } from "zod";
import { type ActivityEvent } from "./model";

export const eventLabels = {
  final_rule: "Publication of a final rule",
  revised_proposal: "A revised or supplemental proposal",
  withdrawal: "Withdrawal of the proposal or rule",
  comment_extension: "Another comment-period extension",
  effective_date_delay: "Another effective-date delay",
  restart: "A new proposal restarting the proceeding",
  no_new_publication: "No new publication in the forecast window",
} as const;
export type ForecastEvent = keyof typeof eventLabels;
const citation = z
  .object({
    text: z.string().min(15).max(400),
    evidence: z.array(z.string()).min(1).max(8),
  })
  .strict();
export const forecastOutputSchema = z
  .object({
    decision: z.enum(["forecast", "abstain"]),
    target_event: z.enum(
      Object.keys(eventLabels) as [ForecastEvent, ...ForecastEvent[]],
    ),
    horizon_days: z.union([z.literal(90), z.literal(180), z.literal(365)]),
    forecast: z.string().min(30).max(700),
    reasons: z.array(citation).min(2).max(4),
    counterargument: citation,
    alternatives: z
      .array(
        z
          .object({
            event: z.enum(
              Object.keys(eventLabels) as [ForecastEvent, ...ForecastEvent[]],
            ),
            explanation: z.string().min(15).max(350),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    horizon_basis: citation,
    watch_for: z.array(z.string().min(15).max(250)).min(1).max(3),
    missing_evidence: z.array(z.string().min(10).max(220)).max(4),
  })
  .strict();
export type ForecastOutput = z.infer<typeof forecastOutputSchema>;
export function forecastEnd(asOf: string, days: number) {
  const d = new Date(asOf);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function allowedEvents(history: ActivityEvent[]): ForecastEvent[] {
  const kind = history[0]?.kind;
  if (kind === "withdrawal") return ["restart", "no_new_publication"];
  if (kind === "delay" || kind === "final")
    return [
      "effective_date_delay",
      "withdrawal",
      "revised_proposal",
      "no_new_publication",
    ];
  return [
    "final_rule",
    "revised_proposal",
    "withdrawal",
    "comment_extension",
    "no_new_publication",
  ];
}
export function validateForecast(
  output: ForecastOutput,
  history: ActivityEvent[],
  known: Set<string>,
) {
  if (!allowedEvents(history).includes(output.target_event))
    throw new Error(
      "Target is already observed or not applicable to this stage.",
    );
  if (output.alternatives.some((a) => a.event === output.target_event))
    throw new Error("An alternative duplicates the main prediction.");
  const citations = [
    ...output.reasons,
    output.counterargument,
    output.horizon_basis,
  ];
  if (citations.some((r) => r.evidence.some((id) => !known.has(id))))
    throw new Error("Forecast cites an unobserved source.");
  if (
    !output.reasons.some((r) =>
      r.evidence.includes(history[0].document.document_number),
    )
  )
    throw new Error("Forecast omits the latest linked publication.");
  const prose = [
    output.forecast,
    ...citations.map((r) => r.text),
    ...output.alternatives.map((a) => a.explanation),
    ...output.watch_for,
  ].join(" ");
  if (/\d\s*%|\b\d+(?:\.\d+)?\s*(?:percent|probability)\b|https?:/i.test(prose))
    throw new Error("Uncalibrated numerical probability or embedded URL.");
}

// This resolution is scoped to retrieved Federal Register history, not legal effect.
export function resolveForecast(
  target: ForecastEvent,
  issued: string,
  end: string,
  history: ActivityEvent[],
  complete: boolean,
  checked: string,
): "pending" | "observed" | "not_observed" | "unresolved" {
  if (!complete) return "unresolved";
  const future = history.filter(
    (e) =>
      e.document.publication_date > issued.slice(0, 10) &&
      e.document.publication_date <= end,
  );
  if (target === "no_new_publication")
    return future.length
      ? "not_observed"
      : checked.slice(0, 10) > end
        ? "observed"
        : "pending";
  const hit = future.some((e) =>
    target === "final_rule"
      ? e.kind === "final"
      : target === "withdrawal"
        ? e.kind === "withdrawal"
        : target === "effective_date_delay"
          ? e.kind === "delay"
          : target === "comment_extension"
            ? e.kind === "comment_extension"
            : target === "restart"
              ? e.kind === "proposal"
              : e.kind === "proposal" &&
                /supplement|revis|repropos/i.test(
                  `${e.document.action} ${e.document.title}`,
                ),
  );
  return hit
    ? "observed"
    : checked.slice(0, 10) > end
      ? "not_observed"
      : "pending";
}
