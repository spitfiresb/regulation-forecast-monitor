import {
  DEFAULT_RULE,
  agendaIndexFor,
  federalRegisterApiFor,
  ruleTargetSchema,
  type RuleTarget,
  type DashboardData,
  type Snapshot,
} from "./model";
import { discoverRuleUrl, parseReginfo } from "./reginfo";
import {
  frDocumentSchema,
  frSearchSchema,
  normalizeFederalRegister,
} from "./federal-register";
import { buildForecast } from "./forecast";
import {
  summarizeChange,
  SUMMARY_PROMPT_VERSION,
  summaryInputHash,
} from "./gemini";
import { getSnapshot, saveSnapshot } from "./repository";
import { compareSnapshots } from "./comparison";
import { getCatalogEntry } from "./catalog";

async function fetchOfficial(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RegulationZForecastMonitor/1.0",
      Accept: "application/json, text/html",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`Official source returned HTTP ${response.status}`);
  return response;
}
async function readAgenda(observedAt: string, target: RuleTarget) {
  const index = await (await fetchOfficial(agendaIndexFor(target))).text();
  let url: string;
  try {
    url = discoverRuleUrl(index, target);
  } catch {
    // Completed and long-term entries are not in the active index. The imported
    // edition is explicitly identified in the UI; absence never means withdrawal.
    const entry = await getCatalogEntry(target.rin);
    if (!entry)
      throw new Error(
        "This rule is absent from the active index and imported catalog.",
      );
    url = `https://www.reginfo.gov/public/do/eAgendaViewRule?RIN=${encodeURIComponent(target.rin)}&pubId=${entry.publication_id}`;
  }
  return parseReginfo(
    await (await fetchOfficial(url)).text(),
    url,
    observedAt,
    target,
  );
}
async function readFederalRegister(observedAt: string, target: RuleTarget) {
  const search = frSearchSchema.parse(
    await (await fetchOfficial(federalRegisterApiFor(target))).json(),
  );
  if (search.count > 30)
    throw new Error("Unexpectedly many publications; source review required.");
  const documents = [];
  // Bounded batches avoid hammering the government API.
  for (let i = 0; i < search.results.length; i += 5) {
    const batch = await Promise.all(
      search.results.slice(i, i + 5).map(async (item) => {
        const response = await fetchOfficial(
          `https://www.federalregister.gov/api/v1/documents/${encodeURIComponent(item.document_number)}.json`,
        );
        return frDocumentSchema.parse(await response.json());
      }),
    );
    documents.push(...batch);
  }
  return normalizeFederalRegister(documents, observedAt, target);
}
export async function collectSnapshot(
  previous?: Snapshot,
  target: RuleTarget = DEFAULT_RULE,
): Promise<Snapshot> {
  ruleTargetSchema.parse(target);
  if (
    previous &&
    (previous.rule.id !== target.id || previous.rule.rin !== target.rin)
  )
    throw new Error("Previous snapshot belongs to another rule");
  const observedAt = new Date().toISOString();
  const [agenda, register] = await Promise.allSettled([
    readAgenda(observedAt, target),
    readFederalRegister(observedAt, target),
  ]);
  if (agenda.status === "rejected")
    throw new Error(
      "Reginfo could not be refreshed. Your previous record has been retained. Try again later; if this persists, review the current official agenda.",
    );
  const warnings: string[] = [];
  const registerSignals =
    register.status === "fulfilled"
      ? register.value
      : (previous?.signals.filter((s) =>
          s.source_name.startsWith("Federal Register"),
        ) ?? []);
  if (register.status === "rejected")
    warnings.push(
      "Federal Register could not be checked. Any earlier publication evidence is retained with its original verification date; current publication status is unverified.",
    );
  const signals = [...agenda.value.signals, ...registerSignals];
  const forecast = buildForecast(agenda.value.rule, signals, observedAt);
  // Reuse a successful summary only while the exact source abstract remains unchanged.
  if (
    process.env.GEMINI_API_KEY &&
    previous?.rule.summary === agenda.value.rule.summary &&
    previous.forecast.summary_method === "gemini" &&
    previous.forecast.summary_metadata?.prompt_version ===
      SUMMARY_PROMPT_VERSION &&
    previous.forecast.summary_metadata?.model ===
      (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite") &&
    previous.forecast.summary_metadata?.input_hash ===
      summaryInputHash(agenda.value.rule.summary)
  ) {
    forecast.expected_change = previous.forecast.expected_change;
    forecast.summary_method = "gemini";
    forecast.summary_metadata = previous.forecast.summary_metadata;
  } else {
    const summary = await summarizeChange(agenda.value.rule.summary);
    forecast.expected_change = summary.text;
    forecast.summary_method = summary.method;
    forecast.summary_metadata = summary.metadata;
    if (summary.warning) warnings.push(summary.warning);
  }
  const snapshot: Snapshot = {
    rule: agenda.value.rule,
    signals,
    forecast,
    synced_at: observedAt,
    federal_register_checked_at:
      register.status === "fulfilled"
        ? observedAt
        : (previous?.federal_register_checked_at ?? null),
    warnings,
    comparison: null,
  };
  snapshot.comparison = compareSnapshots(snapshot, previous);
  return snapshot;
}

const inFlight = new Map<string, Promise<DashboardData>>();
async function performSync(target: RuleTarget): Promise<DashboardData> {
  const previous = await getSnapshot(target.id);
  const snapshot = await collectSnapshot(previous ?? undefined, target);
  const storage = await saveSnapshot(snapshot);
  return { ...snapshot, storage, as_of: Date.now() };
}
export function syncRule(
  target: RuleTarget = DEFAULT_RULE,
): Promise<DashboardData> {
  ruleTargetSchema.parse(target);
  const key = JSON.stringify([target.id, target.rin, target.agency_code]);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = performSync(target).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, pending);
  }
  return pending;
}
