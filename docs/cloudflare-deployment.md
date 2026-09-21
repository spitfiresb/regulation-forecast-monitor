# Cloudflare deployment

Production URL: https://kobaltinterview.party

The `kobalt-interview` Worker runs Next.js through OpenNext. Supabase remains the database. The custom domain, static assets, rate-limit bindings, and public configuration are declared in `wrangler.jsonc`. Cloudflare manages domain routing and HTTPS. No R2 bucket or separate backend is needed for this dynamic app.

## Deploy

Deploy from the single Desktop checkout using Node 22 and the Cloudflare account that owns the domain. Commit and push the intended source to GitHub main first; do not deploy an old checkout or unreviewed local changes:

```sh
cd /Users/zainsaeed/Desktop/regulation-z-forecast-monitor
nvm use
npm ci
npx wrangler login  # only if not already authenticated
git status --short  # must be clean
git push origin main
npm run deploy:cloudflare
```

Existing Worker secrets survive later deployments. Initial deployment requires `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`), and optionally `SYNC_SECRET`. Configure these as Cloudflare secrets, never `NEXT_PUBLIC_` variables. The main activity flow does not call Gemini, so it needs no Google key. Optional legacy summarization can use a separate `GEMINI_API_KEY` secret.

`APP_ORIGIN` must match the exact public HTTPS origin. `REQUIRE_HOSTED_STORAGE=true` prevents a missing database configuration from falling back to ephemeral local files. All current migrations, including `202609210008_recent_activity.sql`, must be applied to Supabase.

The build script removes OpenNext's generated local environment defaults and checks artifacts for local credential values. Production resolves secrets at runtime. Always deploy via the package scripts; do not bypass this sanitization with a raw OpenNext build.

## Preview and verify

```sh
npm run build:cloudflare
npm run preview:cloudflare
```

For local Worker testing, put the Supabase values in the ignored `.dev.vars` file. Wrangler rewrites local request origins to the configured route hostname: with this configuration and HTTP preview, set local `APP_ORIGIN=http://kobaltinterview.party`. Production remains HTTPS.

Verify the homepage, `/api/activity?q=1903-AA20`, and selecting a result in the browser. Source refresh must persist through Supabase. A POST with an unrelated Origin must return 403. API requests beyond their budget return 429 with a retry message.

## Public access and limits

This is a public research demo with no sign-in. Cloudflare's per-location limits allow 60 API reads and 10 API writes per minute per source IP. Shared networks share a budget. Counters are approximate, not globally exact quotas or a spending cap. The API also retains its origin checks and source timeouts. Worker logs are enabled; no credentials are logged by application code.

The Worker uses the custom domain only; workers.dev and preview URLs are disabled. Deployment is currently performed through the CLI. GitHub pushes alone do not deploy the site until a build integration is configured.

References: [OpenNext setup](https://opennext.js.org/cloudflare/get-started), [Cloudflare rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
