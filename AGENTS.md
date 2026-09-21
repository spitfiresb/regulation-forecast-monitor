# One canonical checkout

Work only in `/Users/zainsaeed/Desktop/regulation-z-forecast-monitor`.
GitHub: `https://github.com/spitfiresb/regulation-z-forecast-monitor` (`main`).
Local app: `http://127.0.0.1:3000`. Production: `https://kobaltinterview.party`.

The former home-folder checkout and obsolete Desktop version have been consolidated into this directory. Do not create another checkout or start a second app on another port. Preserve concurrent changes. Read the current activity-based implementation before editing; the legacy agenda monitor is not the homepage.

Production deployment uses `npm run deploy:cloudflare` from this checkout after committing and pushing the exact source to GitHub. GitHub pushes alone do not deploy. Keep the Desktop checkout, GitHub main, and deployed version aligned.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
