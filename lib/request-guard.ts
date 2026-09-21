import { timingSafeEqual } from "node:crypto";

export function authorizeSync(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  if (secret && provided) {
    const a = Buffer.from(secret),
      b = Buffer.from(provided);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let expected = process.env.APP_ORIGIN || null;
  if (!expected && process.env.NODE_ENV !== "production") {
    // Next may normalize request.url to localhost when the browser used 127.0.0.1.
    const requestUrl = new URL(request.url);
    try {
      const browserOrigin = new URL(origin);
      if (
        browserOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(browserOrigin.hostname) &&
        browserOrigin.port === requestUrl.port
      )
        expected = browserOrigin.origin;
    } catch {
      return false;
    }
  }
  // Browser refresh is same-origin. Deployment access control belongs to the host.
  return (
    !!expected &&
    origin === expected &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
