// The generated handler is produced by npm run build:cloudflare.
import handler from "./.open-next/worker.js";
import { deploymentGuard } from "./lib/deployment-guard.ts";

const worker = {
  async fetch(request, env, ctx) {
    const rejection = await deploymentGuard(request, env);
    const response = rejection ?? await handler.fetch(request, env, ctx);
    return response;
  },
};

export default worker;
