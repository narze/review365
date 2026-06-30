# oRPC procedures as the sole backend, with injected storage

All server-side logic — GitHub API calls, board state persistence, repo watchlist management — lives inside oRPC procedures in `packages/api`. The web app (`apps/web`) injects the storage implementation through the oRPC context.

`packages/api` defines a `BoardStore` interface but never imports `node:fs` or any platform-specific storage API. This keeps the API package deployable to Cloudflare Workers without modification. The web app provides `FileBoardStore` (local dev, uses `node:fs`) now; `R2BoardStore` (Cloudflare, uses R2 binding) can be added later by swapping one line in context creation.

`fetch()` for GitHub API calls works in both Node and Workers. Environment variables via `process.env` work in both (SvelteKit's Cloudflare adapter polyfills `process.env` from bindings in production).
