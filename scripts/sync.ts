import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { syncRule } = await import("../lib/sync");
const { DEFAULT_RULE, rinSchema } = await import("../lib/model");
let target = DEFAULT_RULE;
if (process.argv[2]) {
  const rin = rinSchema.parse(process.argv[2].toUpperCase());
  const { searchCatalog } = await import("../lib/catalog");
  const result = await searchCatalog({ q: rin, limit: 100 });
  const entry = result.entries.find((r) => r.rin === rin);
  if (!entry)
    throw new Error(
      "RIN not found in the imported catalog. Run npm run catalog:import first.",
    );
  target = { id: entry.id, rin: entry.rin, agency_code: entry.agency_code };
}
const result = await syncRule(target);
console.log(
  JSON.stringify(
    {
      rin: result.rule.rin,
      stage: result.rule.stage,
      forecast: result.forecast.likelihood,
      synced_at: result.synced_at,
      storage: result.storage,
      warnings: result.warnings,
    },
    null,
    2,
  ),
);
