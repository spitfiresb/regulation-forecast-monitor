type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
type DeploymentEnv = {
  API_READ_LIMIT: Limiter;
  API_WRITE_LIMIT: Limiter;
};

export async function deploymentGuard(request: Request, env: DeploymentEnv) {
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;
  // Anonymous demo: Cloudflare supplies this header. Shared networks share a
  // budget; counters are approximate and local to each Cloudflare location.
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  const limiter = ["GET", "HEAD"].includes(request.method)
    ? env.API_READ_LIMIT
    : env.API_WRITE_LIMIT;
  try {
    if ((await limiter.limit({ key })).success) return null;
    return Response.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Request protection is temporarily unavailable. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
