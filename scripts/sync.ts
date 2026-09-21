import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { syncRule } = await import("../lib/sync");
const result = await syncRule();
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
