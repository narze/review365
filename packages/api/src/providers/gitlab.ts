import type { PRCard, Signal } from "../types";
import type { ProviderContext, ReviewProvider } from "./types";
import { mapWithConcurrency } from "./concurrency";

const DEFAULT_HOST = "https://gitlab.com";

interface GLMr {
  iid: number;
  title: string;
  web_url: string;
  updated_at: string;
  state: "opened" | "closed" | "merged" | "locked";
  draft?: boolean;
  work_in_progress?: boolean;
  author: { username: string } | null;
  reviewers?: { username: string }[] | null;
  project_id: number;
}

interface GLProject {
  path_with_namespace: string;
  archived: boolean;
}

interface GLApprovals {
  approved_by?: { user: { username: string } | null }[];
}

/** Normalizes a host into its API base, e.g. https://gitlab.com -> https://gitlab.com/api/v4. */
function apiBase(host?: string): string {
  const base = (host || DEFAULT_HOST).replace(/\/+$/, "");
  return `${base}/api/v4`;
}

async function glFetch<T>(token: string, host: string | undefined, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${apiBase(host)}${path}`;
  const res = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token, "User-Agent": "review365" },
  });
  if (!res.ok) throw new Error(`GitLab API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function mrKey(repo: string, iid: number): string {
  return `mr_${repo.replaceAll("/", "_")}_${iid}`;
}

function isDraft(mr: GLMr): boolean {
  return mr.draft ?? mr.work_in_progress ?? false;
}

function toPRCard(repo: string, mr: GLMr, isOwnPR: boolean, signals: Signal[] = []): PRCard {
  return {
    id: mrKey(repo, mr.iid),
    platform: "gitlab",
    prNumber: mr.iid,
    repo,
    title: mr.title,
    author: mr.author?.username || "unknown",
    url: mr.web_url,
    updatedAt: mr.updated_at,
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

const APPROVALS_TTL_MS = 10 * 60 * 1000;
const approvalsCache = new Map<string, { approved: boolean; ts: number }>();

const REPO_SEARCH_TTL_MS = 5 * 60 * 1000;
const repoSearchCache = new Map<string, { repos: string[]; ts: number }>();

async function fetchApproved(
  token: string,
  host: string | undefined,
  projectId: number,
  iid: number,
): Promise<boolean> {
  const cacheKey = `${host ?? DEFAULT_HOST}/${projectId}/${iid}`;
  const cached = approvalsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < APPROVALS_TTL_MS) {
    return cached.approved;
  }
  const res = await glFetch<GLApprovals>(
    token,
    host,
    `/projects/${projectId}/merge_requests/${iid}/approvals`,
  );
  const approved = (res.approved_by?.length ?? 0) > 0;
  approvalsCache.set(cacheKey, { approved, ts: Date.now() });
  return approved;
}

/** MRs merge across two queries by card id; keep project ids for the approvals lookup. */
type WorkingCard = PRCard & { signals: Signal[]; projectId: number };

async function fetchProjectMRs(
  token: string,
  host: string | undefined,
  repo: string,
  state: "opened" | "merged",
  extra = "",
): Promise<GLMr[]> {
  return glFetch<GLMr[]>(
    token,
    host,
    `/projects/${encodeURIComponent(repo)}/merge_requests?state=${state}&per_page=100${extra}`,
  );
}

async function fetchPRs(
  ctx: ProviderContext,
  enabledRepos: string[] = [],
  force = false,
  mergedRetentionDays = 14,
): Promise<PRCard[]> {
  const { token, user, host } = ctx;
  const cacheKey = `${host ?? DEFAULT_HOST}:${user}:${enabledRepos.slice().sort().join(",")}:${mergedRetentionDays}`;

  if (!force && prsCache && prsCache.key === cacheKey && Date.now() - prsCache.ts < PRS_TTL_MS) {
    return structuredClone(prsCache.prs);
  }

  if (enabledRepos.length === 0) {
    prsCache = { key: cacheKey, prs: [], ts: Date.now() };
    return [];
  }

  const cardMap = new Map<string, WorkingCard>();
  const cutoff = new Date(Date.now() - mergedRetentionDays * 86400000).toISOString();

  // One repo's fetch doesn't wait on another's: run the whole watchlist concurrently.
  await mapWithConcurrency(enabledRepos, 8, async (repo) => {
    const [openMrs, mergedMrs] = await Promise.all([
      fetchProjectMRs(token, host, repo, "opened"),
      fetchProjectMRs(token, host, repo, "merged", `&updated_after=${cutoff}`),
    ]);

    // 1. All open MRs in the project (unless draft), not just ones involving the user
    for (const mr of openMrs) {
      if (isDraft(mr)) continue;
      const isOwnPR = mr.author?.username === user;
      const signals: Signal[] = ["pr-open"];
      if (isOwnPR) signals.push("own-pr");
      if (mr.reviewers?.some((r) => r.username === user)) signals.push("review-requested");
      cardMap.set(mrKey(repo, mr.iid), { ...toPRCard(repo, mr, isOwnPR, signals), projectId: mr.project_id });
    }

    // 2. Recently merged MRs (any author, within configured retention)
    for (const mr of mergedMrs) {
      const id = mrKey(repo, mr.iid);
      const existing = cardMap.get(id);
      if (existing) {
        if (!existing.signals.includes("merged")) existing.signals.push("merged");
      } else {
        const isOwnPR = mr.author?.username === user;
        const signals: Signal[] = ["merged"];
        if (isOwnPR) signals.push("own-pr");
        cardMap.set(id, { ...toPRCard(repo, mr, isOwnPR, signals), projectId: mr.project_id });
      }
    }
  });

  // Approval status (approvals-only; no changes-requested on GitLab)
  const watchlisted = [...cardMap.values()].filter((c) => !c.signals.includes("merged"));
  await mapWithConcurrency(watchlisted, 8, async (card) => {
    try {
      const approved = await fetchApproved(token, host, card.projectId, card.prNumber);
      if (approved && !card.signals.includes("approved")) card.signals.push("approved");
    } catch {
      // MR may be from a project we can't read approvals for
    }
  });

  const prs = [...cardMap.values()].map(({ projectId: _projectId, ...card }) => card);
  prsCache = { key: cacheKey, prs, ts: Date.now() };
  return prs;
}

async function fetchOwnedRepos(ctx: ProviderContext, query: string): Promise<string[]> {
  const { token, user, host } = ctx;
  const cacheKey = `${host ?? DEFAULT_HOST}:${user}:${query}`;
  const cached = repoSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REPO_SEARCH_TTL_MS) {
    return cached.repos;
  }

  const search = query ? `&search=${encodeURIComponent(query)}` : "";
  const res = await glFetch<GLProject[]>(
    token,
    host,
    `/projects?membership=true&order_by=last_activity_at&sort=desc&per_page=100${search}`,
  );
  const repos = res.filter((p) => !p.archived).map((p) => p.path_with_namespace);
  repoSearchCache.set(cacheKey, { repos, ts: Date.now() });
  return repos;
}

async function validateToken(token: string, host?: string): Promise<{ user: string }> {
  const res = await glFetch<{ username: string }>(token, host, "/user");
  return { user: res.username };
}

export const gitlabProvider: ReviewProvider = {
  platform: "gitlab",
  validateToken,
  fetchPRs,
  fetchOwnedRepos,
  invalidateCache() {
    prsCache = null;
  },
};
