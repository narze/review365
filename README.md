# Review365 — PR Review Kanban Board

Dark-themed Kanban board for tracking GitHub PR reviews across all your repos.
Poll-based — no webhook setup needed.

**Stack:** SvelteKit + Cloudflare Workers + R2 + GitHub API

## Features

- **Repo Watchlist** — opt-in filter; only show PRs from repos you've added. Search covers your repos + all your org repos (e.g. `eventpop`, `Manoonchai`). New repos stay hidden until you add them.
- **Kanban columns** — drag PRs between columns, positions persist in R2
- **Auto-refresh** — polls GitHub every 30 seconds
- **Own PR badge** — your PRs marked with green badge

### Columns
1. 📥 **To Review** — new PRs / new commits / review-requested
2. 👀 **In Review** — currently reviewing (manually drag here when you start)
3. 🔄 **Revisions** — changes requested, waiting on author
4. ⏳ **Awaiting Approval** — own PRs reviewed but need someone else to approve
5. ✅ **Approved** — approved, ready to merge
6. 🎉 **Merged** — done!

## How It Works

- 🔄 Auto-refreshes every 30 seconds
- 🖱️ Drag cards between columns (saved to R2)
- 📁 Repo watchlist filters which PRs are visible (persisted in R2, syncs across devices)
- 🟢 Own PRs marked with green badge

---

## Setup

### 1. GitHub Token

Use a **classic PAT** (not fine-grained — enterprise orgs like Eventpop block fine-grained PATs with lifetime > 366 days).

👉 https://github.com/settings/tokens/new

| Field | Value |
|-------|-------|
| Note | `Review365` |
| Expiration | e.g. 1 year |
| Scopes | `repo` (full repo access) + `read:org` |

Or generate via `gh` CLI (already has the right scopes):
```bash
gh auth token
```

### 2. Cloudflare R2 Bucket

Create an R2 bucket for board state persistence:
```
Bucket name: review365-board-state
```

### 3. Cloudflare Workers Build (Git Integration)

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Workers** → connect to Git → `narze/review365`
2. Set:
   - **Build command:** `npm run build`
   - **Deploy command:** `npm run deploy`
3. The `wrangler.jsonc` in the repo handles the rest (assets directory, R2 binding, Workers entry point).

### 4. Environment Variables

In the Workers project → **Settings** → **Variables and Secrets**:

| Variable | Value | Type |
|----------|-------|------|
| `GITHUB_TOKEN` | your classic PAT (`ghp_...` or `gho_...`) | **Secret** |
| `GITHUB_USER` | your GitHub username (e.g. `narze`) | Text |

### 5. R2 Binding

The R2 binding is already configured in `wrangler.jsonc`:
```json
"r2_buckets": [{ "binding": "BOARD_STATE", "bucket_name": "review365-board-state" }]
```
No manual dashboard setup needed — `wrangler deploy` applies it automatically.

### 6. Cloudflare Access (optional — restrict to your account)

To prevent public access:

1. Go to **[Cloudflare Zero Trust](https://one.dash.cloudflare.com/)** → choose a team name (free for up to 50 users)
2. **Access** → **Applications** → **Add application** → **Self-hosted**
3. **Application domain:** `review365.narze.workers.dev`
4. Create policy:
   - **Name:** `Only me`
   - **Action:** Allow
   - **Include:** Emails → `your@email.com`
5. Save

Now only your email can access the site; everyone else gets redirected to Cloudflare login.

---

## Local Dev

```bash
# .env file (gitignored):
#   GITHUB_TOKEN=ghp_...  (or gho_... from gh auth token)
#   GITHUB_USER=narze

npm install
npm run dev          # vite dev server (http://localhost:5173)
```

Board state saves to `~/.hermes/review365-board.json` locally (R2 fallback for dev).

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build → `.svelte-kit/cloudflare/` |
| `npm run deploy` | Deploy to Cloudflare Workers (`wrangler deploy`) |
| `npm run preview` | Preview production build locally |
| `npm run check` | Type check (wrangler types + svelte-check) |
| `npm run lint` | Prettier + ESLint |
| `npm run gen` | Regenerate `worker-configuration.d.ts` (run after changing `wrangler.jsonc`) |

## Project Structure

```
src/
├── lib/
│   ├── types.ts                # PRCard, BoardState, ColumnId types
│   ├── server/
│   │   ├── github.ts           # GitHub API: search PRs, fetch owned+org repos
│   │   └── board.ts            # R2 board state: load/save/toggle repo/erase
│   └── components/
│       ├── KanbanBoard.svelte  # Board layout + repo filter integration
│       ├── KanbanColumn.svelte # Drag-drop column
│       ├── KanbanCard.svelte   # PR card
│       └── RepoFilter.svelte   # Watchlist dropdown (Watching + Find repos)
├── routes/
│   ├── +page.server.ts         # Main page data loader
│   ├── +page.svelte            # Page shell (state, polling, repo toggle)
│   └── api/
│       ├── board/+server.ts    # Board state API (card move, repo toggle)
│       ├── prs/+server.ts      # PR fetch API (GitHub search → board merge)
│       └── repos/+server.ts    # Repo search API (for watchlist dropdown)
└── app.d.ts
```
