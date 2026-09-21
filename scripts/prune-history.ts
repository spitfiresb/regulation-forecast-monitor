import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { pruneHistory } = await import("../lib/repository");
await pruneHistory();
console.log(
  "History older than six calendar months removed; current snapshots and their evidence retained.",
);
