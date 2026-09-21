import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

// OpenNext copies local .env values into this server module. Production must
// use Cloudflare secrets instead of shipping developer credentials in bundles.
await writeFile(
  ".open-next/cloudflare/next-env.mjs",
  "export const production = {};\nexport const development = {};\nexport const test = {};\n",
);
const sensitive = [];
for (const name of await readdir(".")) {
  if (!/^\.env(?:\.|$)/.test(name) || name === ".env.example") continue;
  const vars = parseEnv(await readFile(name, "utf8"));
  for (const [key, value] of Object.entries(vars))
    if (/KEY|SECRET|TOKEN|PASSWORD/.test(key) && value.length >= 12)
      sensitive.push(value);
}
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (entry.isFile()) {
      if (/^\.env(?:\.|$)/.test(entry.name)) {
        await rm(path);
        continue;
      }
      const content = await readFile(path);
      if (sensitive.some((secret) => content.includes(secret)))
        throw new Error(`Credential found in build artifact: ${path}`);
    }
  }
}
await inspect(".open-next");
console.log("Worker artifacts checked; runtime credentials must use Cloudflare secrets.");
