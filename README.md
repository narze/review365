# Review365 — PR Review Kanban Board

Dark-themed Kanban board for tracking GitHub PR reviews across all your repos.

**Stack:** SvelteKit + Cloudflare Pages + R2 + GitHub API

## Columns
1. 📥 To Review — new PRs / new commits after changes requested
2. 👀 In Review — currently reviewing (WIP: 1-2 cards)
3. 🔄 Revisions — changes requested, waiting on author
4. ⏳ Awaiting Approval — own PRs reviewed but need someone else to approve
5. ✅ Approved — approved, ready to merge
6. 🎉 Merged — done!

## Setup

### Prerequisites
- Cloudflare account
- GitHub token with `repo` scope

### Deploy to Cloudflare Pages

1. Fork/clone this repo
2. Create R2 bucket:
   ```bash
   wrangler r2 bucket create review365-board-state
   ```
3. Set secrets:
   ```bash
   wrangler pages secret put GITHUB_TOKEN
   wrangler pages secret put GITHUB_USER
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

## Local Dev
```bash
cp .env.example .env
# edit .env with your GITHUB_TOKEN and GITHUB_USER
npm run dev
```
