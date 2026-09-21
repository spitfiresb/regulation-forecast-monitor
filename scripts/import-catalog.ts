import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { collectCatalog, saveCatalog } = await import("../lib/catalog");
const { pruneHistory } = await import("../lib/repository");
const catalog = await collectCatalog();
const storage = await saveCatalog(catalog);
await pruneHistory();
console.log(
  JSON.stringify(
    {
      rules: catalog.entries.length,
      publication_id: catalog.publication_id,
      imported_at: catalog.imported_at,
      source_url: catalog.source_url,
      storage,
      history_months: 6,
    },
    null,
    2,
  ),
);
