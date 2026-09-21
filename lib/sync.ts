import {
  AGENDA_INDEX,
  FR_API,
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
import { summarizeChange } from "./gemini";
import { getDashboard, saveSnapshot } from "./repository";

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
async function readAgenda(observedAt: string) {
  const index = await (await fetchOfficial(AGENDA_INDEX)).text();
  const url = discoverRuleUrl(index);
  return parseReginfo(await (await fetchOfficial(url)).text(), url, observedAt);
}
async function readFederalRegister(observedAt: string) {
  const search = frSearchSchema.parse(
    await (await fetchOfficial(FR_API)).json(),
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
  return normalizeFederalRegister(documents, observedAt);
}
export async function collectSnapshot(previous?: Snapshot): Promise<Snapshot> {
  const observedAt = new Date().toISOString();
  const [agenda, register] = await Promise.allSettled([
    readAgenda(observedAt),
    readFederalRegister(observedAt),
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
    previous.forecast.summary_method === "gemini"
  ) {
    forecast.expected_change = previous.forecast.expected_change;
    forecast.summary_method = "gemini";
  } else {
    const summary = await summarizeChange(agenda.value.rule.summary);
    forecast.expected_change = summary.text;
    forecast.summary_method = summary.method;
    if (summary.warning) warnings.push(summary.warning);
  }
  return {
    rule: agenda.value.rule,
    signals,
    forecast,
    synced_at: observedAt,
    federal_register_checked_at:
      register.status === "fulfilled"
        ? observedAt
        : (previous?.federal_register_checked_at ?? null),
    warnings,
  };
}

let inFlight: Promise<DashboardData> | null = null;
async function performSync(): Promise<DashboardData> {
  const previous = await getDashboard();
  const snapshot = await collectSnapshot(previous);
  const storage = await saveSnapshot(snapshot);
  return { ...snapshot, storage, as_of: Date.now() };
}
export function syncRule(): Promise<DashboardData> {
  // Coalesce concurrent refreshes in this process; database writes are serialized too.
  if (!inFlight)
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  return inFlight;
}
