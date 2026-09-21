import nextEnv from "@next/env";
import baseline from "../data/baseline.json";
import { summarizeChange } from "../lib/gemini";
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.GEMINI_API_KEY)
  throw new Error("Set GEMINI_API_KEY in .env.local first.");
const result = await summarizeChange(baseline.rule.summary);
console.log(JSON.stringify(result, null, 2));
if (result.method !== "gemini") process.exitCode = 1;
