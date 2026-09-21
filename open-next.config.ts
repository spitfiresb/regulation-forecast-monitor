import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Dynamic application data is persisted in Supabase; no ISR cache is required.
export default defineCloudflareConfig();
