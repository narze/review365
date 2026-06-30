# Review365 — PR Review Kanban Board

Dark-themed Kanban board for tracking GitHub PR reviews across all your repos.
Poll-based — no webhook setup needed.

**Stack:** SvelteKit + Cloudflare Pages + R2 + GitHub API

## Columns
1. 📥 **To Review** — new PRs / new commits / review-requested
2. 👀 **In Review** — currently reviewing (manually drag here when you start)
3. 🔄 **Revisions** — changes requested, waiting on author
4. ⏳ **Awaiting Approval** — own PRs reviewed but need someone else to approve
5. ✅ **Approved** — approved, ready to merge
6. 🎉 **Merged** — done!

## How It Works

- 🔄 Auto-refreshes every 30 seconds
- 🖱️ Drag cards between columns (saved to R2)
- 📊 PRs from ALL repos (user-level GitHub search)
- 🟢 Own PRs marked with green badge

## Deployment (GitHub Integration)

### One-time setup in Cloudflare Dashboard:

1. **Cloudflare Pages** → Create → Connect to Git → `narze/review365`
   - Framework: SvelteKit
   - Build command: `npm run build`
   - Output directory: `.svelte-kit/cloudflare`

2. **R2** → Create bucket `review365-board-state`

3. **Pages project** → Settings → Functions → R2 bindings:
   - Variable: `BOARD_STATE` → Bucket: `review365-board-state`

4. **Pages project** → Settings → Environment variables:
   - `GITHUB_TOKEN` — GitHub fine-grained PAT (pull_requests:read + metadata:read)
   - `GITHUB_USER` — your GitHub username (e.g. `narze`)

Done! Every `git push` auto-deploys. 🎉

## Creating a GitHub Token

👉 https://github.com/settings/tokens?type=beta

| Field | Value |
|-------|-------|
| Name | `Review365` |
| Expiration | Custom (e.g. 1 year) |
| Repository access | All repositories |
| Pull requests | Read-only |
| Metadata | Read-only (auto) |

## Local Dev
```bash
cp .env.example .env
# edit .env with GITHUB_TOKEN=... and GITHUB_USER=narze
npm install
npm run dev
```
