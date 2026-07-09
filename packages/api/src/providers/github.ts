import type { PRCard, Signal } from "../types";
import type { ProviderContext, ReviewProvider } from "./types";
import { mapWithConcurrency } from "./concurrency";

const GITHUB_API = "https://api.github.com";

interface GHPullListItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  user: { login: string } | null;
  draft: boolean;
  requested_reviewers?: { login: string }[] | null;
}

interface GHSearchItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  user: { login: string } | null;
}

interface GHSearchResponse {
  total_count: number;
  items: GHSearchItem[];
}

interface GHRepoSearchResponse {
  total_count: number;
  items: { full_name: string; archived: boolean }[];
}

interface GHOrg {
  login: string;
}

interface GHReview {
  id: number;
  user: { login: string } | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submitted_at: string;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "review365",
  };
}

async function ghFetch<T>(token: string, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function prKey(repo: string, number: number): string {
  return `pr_${repo.replaceAll("/", "_")}_${number}`;
}

function toPRCard(
  repo: string,
  pr: { number: number; title: string; html_url: string; updated_at: string; user: { login: string } | null },
  isOwnPR: boolean,
  signals: Signal[] = [],
): PRCard {
  return {
    id: prKey(repo, pr.number),
    platform: "github",
    prNumber: pr.number,
    repo,
    title: pr.title,
    author: pr.user?.login || "unknown",
    url: pr.html_url,
    updatedAt: pr.updated_at,
    isOwnPR,
    columnId: "inbox",
    signals,
    archived: false,
    order: 0,
  };
}

// === Caches ===

const PRS_TTL_MS = 5 * 60 * 1000;
let prsCache: { key: string; prs: PRCard[]; ts: number } | null = null;

const ORGS_TTL_MS = 10 * 60 * 1000;
let orgsCache: { user: string; orgs: string[]; ts: number } | null = null;

const REVIEW_TTL_MS = 10 * 60 * 1000;
const reviewCache = new Map<string, { reviews: GHReview[]; ts: number }>();

const REPO_SEARCH_TTL_MS = 5 * 60 * 1000;
const repoSearchCache = new Map<string, { repos: string[]; ts: number }>();

async function fetchUserOrgs(token: string, user: string): Promise<string[]> {
  if (orgsCache && orgsCache.user === user && Date.now() - orgsCache.ts < ORGS_TTL_MS) {
    return orgsCache.orgs;
  }
  const orgs = await ghFetch<GHOrg[]>(token, `/users/${user}/orgs?per_page=100`);
  const logins = orgs.map((o) => o.login);
  orgsCache = { user, orgs: logins, ts: Date.now() };
  return logins;
}

async function fetchReviews(token: string, repo: string, prNumber: number): Promise<GHReview[]> {
  const cacheKey = `${repo}/${prNumber}`;
  const cached = reviewCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REVIEW_TTL_MS) {
    return cached.reviews;
  }
  const reviews = await ghFetch<GHReview[]>(
    token,
    `/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`,
  );
  reviewCache.set(cacheKey, { reviews, ts: Date.now() });
  return reviews;
}

async function fetchOpenPRs(token: string, repo: string): Promise<GHPullListItem[]> {
  return ghFetch<GHPullListItem[]>(token, `/repos/${repo}/pulls?state=open&per_page=100`);
}

async function fetchMergedPRs(token: string, repo: string, cutoff: string): Promise<GHSearchItem[]> {
  const query = `is:pr is:merged repo:${repo} merged:>=${cutoff}`;
  const res = await ghFetch<GHSearchResponse>(
    token,
    `/search/issues?q=${encodeURIComponent(query)}&per_page=50`,
  );
  return res.items;
}

async function fetchPRs(
  ctx: ProviderContext,
  enabledRepos: string[] = [],
  force = false,
  mergedRetentionDays = 14,
): Promise<PRCard[]> {
  const { token, user } = ctx;
  const cacheKey = `${user}:${enabledRepos.slice().sort().join(",")}:${mergedRetentionDays}`;

  if (!force && prsCache && prsCache.key === cacheKey && Date.now() - prsCache.ts < PRS_TTL_MS) {
    const prs = structuredClone(prsCache.prs);
    if (enabledRepos.length > 0) {
      const cardMap = new Map(prs.map((p) => [p.id, p]));
      for (const pr of prs) {
        pr.signals = pr.signals.filter((s) => s !== "approved" && s !== "changes-requested");
      }
      await enrichWithReviewSignals(token, cardMap, user);
    }
    return prs;
  }

  if (enabledRepos.length === 0) {
    prsCache = { key: cacheKey, prs: [], ts: Date.now() };
    return [];
  }

  const cardMap = new Map<string, PRCard & { signals: Signal[] }>();
  const cutoff = new Date(Date.now() - mergedRetentionDays * 86400000).toISOString().split("T")[0];

  // One repo's fetch doesn't wait on another's: run the whole watchlist concurrently.
  await mapWithConcurrency(enabledRepos, 8, async (repo) => {
    const [openPRs, mergedPRs] = await Promise.all([
      fetchOpenPRs(token, repo),
      fetchMergedPRs(token, repo, cutoff),
    ]);

    // 1. All open PRs in the repo (unless draft), not just ones involving the user
    for (const pr of openPRs) {
      if (pr.draft) continue;
      const isOwnPR = pr.user?.login === user;
      const signals: Signal[] = ["pr-open"];
      if (isOwnPR) signals.push("own-pr");
      if (pr.requested_reviewers?.some((r) => r.login === user)) signals.push("review-requested");
      cardMap.set(prKey(repo, pr.number), { ...toPRCard(repo, pr, isOwnPR), signals });
    }

    // 2. Recently merged PRs (any author, within configured retention)
    for (const pr of mergedPRs) {
      const id = prKey(repo, pr.number);
      const existing = cardMap.get(id);
      if (existing) {
        if (!existing.signals.includes("merged")) existing.signals.push("merged");
      } else {
        const isOwnPR = pr.user?.login === user;
        const signals: Signal[] = ["merged"];
        if (isOwnPR) signals.push("own-pr");
        cardMap.set(id, { ...toPRCard(repo, pr, isOwnPR), signals });
      }
    }
  });

  await enrichWithReviewSignals(token, cardMap, user);

  const prs = [...cardMap.values()];
  prsCache = { key: cacheKey, prs, ts: Date.now() };
  return prs;
}

async function enrichWithReviewSignals(
  token: string,
  cardMap: Map<string, PRCard & { signals: Signal[] }>,
  user: string,
) {
  const watchlisted = [...cardMap.values()].filter((c) => !c.signals.includes("merged"));
  await mapWithConcurrency(watchlisted, 8, async (card) => {
    try {
      const reviews = await fetchReviews(token, card.repo, card.prNumber);
      const myReviews = reviews
        .filter((r) => r.user?.login === user)
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
      const lastReview = myReviews[myReviews.length - 1];

      if (lastReview) {
        if (lastReview.state === "APPROVED") {
          card.signals.push("approved");
        } else if (lastReview.state === "CHANGES_REQUESTED") {
          card.signals.push("changes-requested");
        }
      }

      if (card.isOwnPR) {
        const otherApprovals = reviews
          .filter((r) => r.user?.login !== user && r.state === "APPROVED")
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
        if (otherApprovals.length > 0 && !card.signals.includes("approved")) {
          card.signals.push("approved");
        }
        const otherChanges = reviews
          .filter((r) => r.user?.login !== user && r.state === "CHANGES_REQUESTED")
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
        if (otherChanges.length > 0 && !card.signals.includes("changes-requested")) {
          card.signals.push("changes-requested");
        }
      }
    } catch {
      // PR may be from a repo we can't access reviews for
    }
  });
}

async function fetchOwnedRepos(ctx: ProviderContext, query: string): Promise<string[]> {
  const { token, user } = ctx;
  const cacheKey = `${user}:${query}`;
  const cached = repoSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REPO_SEARCH_TTL_MS) {
    return cached.repos;
  }

  const orgs = await fetchUserOrgs(token, user);
  const parts = [`user:${user}`, ...orgs.map((o) => `org:${o}`)];
  if (query) parts.push(query);
  const q = parts.join(" ");
  const res = await ghFetch<GHRepoSearchResponse>(
    token,
    `/search/repositories?q=${encodeURIComponent(q)}&per_page=100`,
  );
  const repos = res.items.filter((r) => !r.archived).map((r) => r.full_name);
  repoSearchCache.set(cacheKey, { repos, ts: Date.now() });
  return repos;
}

async function validateToken(token: string): Promise<{ user: string }> {
  const res = await ghFetch<{ login: string }>(token, "/user");
  return { user: res.login };
}

export const githubProvider: ReviewProvider = {
  platform: "github",
  validateToken,
  fetchPRs,
  fetchOwnedRepos,
  invalidateCache() {
    prsCache = null;
  },
};
