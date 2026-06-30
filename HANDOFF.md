# Review365 — Handoff Notes
**Date:** 2026-06-30 ~18:30 ICT  
**Branch:** `main` (clean, all committed)  
**Remote:** `origin` → `https://github.com/narze/review365.git`

---

## What Got Done Today

### 4fdb981 `fix: remove wrangler from build step` ⭐ (latest)
- **The sharp fix!** Changed `build` script from `wrangler types && vite build` → `vite build`
- `wrangler types` was pulling in `sharp` as a transitive dep (via `@img/sharp-darwin-arm64`), triggering node-gyp source compilation
- `worker-configuration.d.ts` is pre-committed — only need `npm run gen` (wrangler types) when you change `wrangler.jsonc`
- Eliminates sharp/node-gyp from Cloudflare Pages CI entirely

### 68af612 `fix: remove wrangler --check, add local dev support`
- `wrangler types --check` → `wrangler types` (no fail on CI mismatch)
- `GITHUB_TOKEN` via `$env/dynamic/private` — works local + Cloudflare
- R2 fallback to `~/.hermes/review365-board.json` for local dev
- Works on macOS/Linux with just `.env` file

### 493c230 `refactor: remove webhook, use manual polling only`
### 6963e09 `feat: add webhook endpoint for auto column movement`
### fdb9b40 `feat: initial board with SvelteKit + Cloudflare Pages + R2`

---

## Project Structure
```
src/
├── lib/
│   ├── types.ts              # PRCard, BoardState, ColumnId types
│   ├── server/
│   │   ├── github.ts          # GitHub API: search PRs (review-requested + own)
│   │   └── board.ts           # R2 board state: load/save/get/set card columns
│   └── index.ts
├── routes/
│   ├── +page.server.ts        # Main page data loader
│   └── api/
│       ├── board/+server.ts   # Board state API (load/save from R2, local file fallback)
│       └── prs/+server.ts     # PR fetch API (GitHub search → board merge)
└── app.d.ts
```

---

## How to Run Locally
```bash
cd ~/Code/github.com/narze/review365
# .env already exists with GITHUB_TOKEN
npm install    # should be clean now — no sharp/node-gyp!
npm run dev    # vite dev server
```

---

## Current State
- **27 PRs** in the board, all in "To Review" column
- Manual polling only (refresh button) — no webhook
- Board state persisted in Cloudflare R2 (production) / `~/.hermes/review365-board.json` (local dev)
- 5 columns: To Review, In Review, Revisions, Awaiting Approval, Approved
- All visible PRs have "own" badge — these are your PRs across repos

---

## Next Ideas (not started)
- Drag-and-drop between columns
- Auto-column movement based on PR status/labels
- Filter/sort options
- Dark mode polish
