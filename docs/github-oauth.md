# GitHub OAuth for "Connect with GitHub"

Review365 is mostly a static SPA. GitHub OAuth still needs a tiny server to hold
`GITHUB_CLIENT_SECRET` and exchange the authorization code for an access token.

## Flow

1. User clicks **Connect with GitHub** → `GET /api/auth/github/start`
2. Server sets an HttpOnly `state` cookie and redirects to GitHub authorize
3. GitHub redirects to `GET /api/auth/github/callback?code&state`
4. Server verifies `state`, exchanges `code` for a token, clears the cookie
5. Browser lands on `/settings/oauth#access_token=…`
6. Client reads the hash, stores the token via `saveToken()`, redirects home

The access token is returned in the URL hash (not query) so it is not sent to
the server on the final page load and is less likely to appear in Referer logs.

## Scopes

`repo` + `read:org` — same as the recommended classic PAT.

## Local development

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Homepage URL: `http://localhost:5173`
3. Authorization callback URL: `http://localhost:5173/api/auth/github/callback`
4. Copy `.env.example` → `.env` and set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
5. Optionally set `APP_ORIGIN=http://localhost:5173`
6. `bun run dev` — Vite middleware serves the same `/api/auth/github/*` routes

## Production (Vercel)

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the project env.
Callback URL: `https://<your-domain>/api/auth/github/callback`

**Project Root Directory** must be the repository root (not `apps/web`), so
the `/api` Edge Functions and the static site are deployed together.
`vercel.json` builds the web app then stages it to `./build` via
`scripts/stage-web-build.mjs` (handles output in either `apps/web/build` or
`./build`).

Handlers live under `/api/auth/github/` as Vercel Edge Functions and share
helpers in `api/_lib/github-oauth.ts`.
