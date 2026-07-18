# review365

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines SvelteKit, Self, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **SvelteKit** - Web framework for building Svelte apps
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Vite+** - Unified Vite toolchain, workspace task runner, linting, and formatting

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the fullstack application.

### Connect with GitHub (OAuth)

Optional. Copy `.env.example` to `.env` and set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
from a [GitHub OAuth App](https://github.com/settings/developers). Callback URL:
`http://localhost:5173/api/auth/github/callback`. See [docs/github-oauth.md](docs/github-oauth.md).

## Deploy (Cloudflare Pages)

Review365 ships as a static SPA (`@sveltejs/adapter-static`) plus two Cloudflare
Pages Functions for the OAuth exchange (`/api/auth/github/*`).

### One-time setup

1. Create the project on Cloudflare:
   ```bash
   bunx wrangler pages project create review365
   ```
2. Set OAuth secrets (do **not** commit them):
   ```bash
   bunx wrangler pages secret put GITHUB_CLIENT_ID     --project-name review365
   bunx wrangler pages secret put GITHUB_CLIENT_SECRET --project-name review365
   ```
3. Update your GitHub OAuth App callback URL to:
   `https://<your-project>.pages.dev/api/auth/github/callback`
   (or your custom domain)

### Deploy from local

```bash
bun run pages:deploy    # = vp build && wrangler pages deploy build
```

### CI/CD

The simplest path is to connect the GitHub repo in the Cloudflare Pages dashboard
(`Create application → Pages → Connect to Git`). Set build:

- **Framework preset**: None
- **Build command**: `bun run build`
- **Build output directory**: `apps/web/build`
- **Root directory**: (repo root)

Cloudflare will auto-build on every push. Add `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` under **Settings → Environment variables**.

See [docs/github-oauth.md](docs/github-oauth.md) for the full flow, scopes, and
private-org troubleshooting.

## Git Hooks and Formatting

- Optional native Vite+ hooks: `bun run hooks:setup`
- Docs: [Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)
- Run checks: `bun run check`

## Project Structure

```
review365/
├── apps/
│   └── web/         # Fullstack application (SvelteKit)
├── packages/
│   ├── api/         # API layer / business logic
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `bun run lint`: Run Vite+ lint checks
- `bun run format`: Run Vite+ formatting
- `bun run staged`: Run Vite+ checks against staged files
- `bun run hooks:setup`: Install Vite+ native Git hooks with `vp config`
