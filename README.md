# Review365 — PR Review Kanban Board

Dark-themed Kanban board for tracking GitHub PR reviews across all your repos.
Supports **webhook-driven auto-column movement**.

**Stack:** SvelteKit + Cloudflare Pages + R2 + GitHub API + Webhooks

## Columns
1. 📥 **To Review** — new PRs / new commits / review-requested
2. 👀 **In Review** — currently reviewing (manually drag here when you start)
3. 🔄 **Revisions** — changes requested, waiting on author
4. ⏳ **Awaiting Approval** — own PRs reviewed but need someone else to approve
5. ✅ **Approved** — approved, ready to merge
6. 🎉 **Merged** — done!

## Webhook Auto-Move Rules

| GitHub Event | → Column |
|-------------|----------|
| PR opened | 📥 To Review |
| `review_requested` @you | 📥 To Review |
| New commit pushed (after changes) | 📥 To Review |
| You approve someone's PR | ✅ Approved |
| Someone approves your PR | ✅ Approved |
| Changes requested | 🔄 Revisions |
| PR merged | 🎉 Merged |
| PR closed (not merged) | 🗑️ removed |

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
   - `GITHUB_TOKEN` — GitHub PAT with `repo` scope
   - `GITHUB_USER` — your GitHub username (e.g. `narze`)
   - `GITHUB_WEBHOOK_SECRET` — random string for webhook verification

5. **GitHub** → Settings → Webhooks → Add:
   - URL: `https://your-project.pages.dev/api/webhook`
   - Content type: `application/json`
   - Events: **Pull request reviews** + **Pull requests**
   - Secret: same as `GITHUB_WEBHOOK_SECRET`

Done! Every `git push` auto-deploys. 🎉

## Local Dev
```bash
cp .env.example .env
# edit .env with your GITHUB_TOKEN and GITHUB_USER
npm install
npm run dev
```
