# GitHub OAuth for "Connect with GitHub"

Review365 is mostly a static SPA. GitHub OAuth still needs a tiny server to hold
`GITHUB_CLIENT_SECRET` and exchange the authorization code for an access token.

## Register the right app type

Review365 uses the **classic OAuth App** flow with `scope=repo read:org`. Create it under
[Developer settings → OAuth Apps](https://github.com/settings/developers) (**not** "GitHub Apps").

| | OAuth App (required) | GitHub App (wrong for this project) |
| --- | --- | --- |
| Client ID prefix | `Ov…` | `Iv…` |
| Scopes | Requested in authorize URL (`repo`, `read:org`) | Ignored — uses app permissions + installation |
| Org private repos | Shown on authorize page; org owners can Grant | Requires installing the app on each account/org |

Production `GITHUB_CLIENT_ID` must start with `Ov`. If it starts with `Iv`, users will only see
identity permissions on the authorize screen and private repos will not work.

### Create an OAuth App

1. [New OAuth App](https://github.com/settings/applications/new)
2. Homepage URL: your app origin (e.g. `https://review365.example`)
3. Authorization callback URL: `{APP_ORIGIN}/api/auth/github/callback`
4. Copy Client ID (`Ov…`) and generate a client secret into env vars

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

`repo` + `read:org` — same as the recommended classic PAT. The `repo` scope is required
so the app can list and read private repositories you can access.

## Private organization repositories

If you connect with GitHub OAuth but only see **public** repos from an organization,
the org has likely not granted this OAuth app access to private repositories:

1. Open **GitHub → Settings → Applications → Authorized OAuth Apps** and select Review365
2. Under **Organization access**, click **Grant** (or **Request**) for each org (e.g. `eventpop`)
3. If the org uses SAML SSO, also click **Authorize** next to the org on that page
4. Disconnect and **Connect with GitHub** again in Review365 so the token is refreshed

Org admins can also allow the app under **Organization settings → Third-party access**.

Repository search in Review365 lists repos via the GitHub REST API (`/user/repos` and
`/orgs/{org}/repos`), not the Search API, so private repos appear when your token and
org policy allow access.

## Local development

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Homepage URL: `http://localhost:5173`
3. Authorization callback URL: `http://localhost:5173/api/auth/github/callback`
4. Copy `.env.example` → `.env` and set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
5. Optionally set `APP_ORIGIN=http://localhost:5173`
6. `bun run dev` — Vite middleware serves the same `/api/auth/github/*` routes

## Production (Vercel)

Vercel **Root Directory** is `apps/web` (matches this project's dashboard setting).
OAuth handlers live at `apps/web/api/auth/github/` and deploy as Edge Functions
alongside the static site. Shared helpers: `apps/web/api/_lib/github-oauth.ts`.
Config: `apps/web/vercel.json` (`cleanUrls` so `/settings/oauth` serves
`settings/oauth.html`; SPA rewrite for other client routes; `/api/*` excluded).

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the project env.
Callback URL: `https://<your-domain>/api/auth/github/callback`
