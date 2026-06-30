import type { PRCard } from '$lib/types';

const GITHUB_API = 'https://api.github.com';

interface GHPR {
	number: number;
	title: string;
	html_url: string;
	updated_at: string;
	user: { login: string } | null;
	repository_url: string;
	draft: boolean;
}

interface GHSearchResponse {
	total_count: number;
	items: GHPR[];
}

interface GHRepo {
	id: number;
	name: string;
	full_name: string;
	archived: boolean;
}

interface GHRepoSearchResponse {
	total_count: number;
	items: GHRepo[];
}

interface GHOrg {
	login: string;
}

let orgsCache: { user: string; orgs: string[]; ts: number } | null = null;
const ORGS_TTL_MS = 5 * 60 * 1000;

async function fetchUserOrgs(token: string, user: string): Promise<string[]> {
	if (orgsCache && orgsCache.user === user && Date.now() - orgsCache.ts < ORGS_TTL_MS) {
		return orgsCache.orgs;
	}
	const orgs = await ghFetch<GHOrg[]>(token, `/users/${user}/orgs?per_page=100`);
	const logins = orgs.map((o) => o.login);
	orgsCache = { user, orgs: logins, ts: Date.now() };
	return logins;
}

function headers(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'review365'
	};
}

async function ghFetch<T>(token: string, path: string): Promise<T> {
	const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
	const res = await fetch(url, { headers: headers(token) });
	if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
	return res.json() as Promise<T>;
}

export async function fetchPRs(token: string, user: string): Promise<PRCard[]> {
	const prs: PRCard[] = [];

	// 1. PRs where user is requested as reviewer
	const reviewQuery = `is:pr is:open review-requested:${user}`;
	const reviewResult = await ghFetch<GHSearchResponse>(
		token,
		`/search/issues?q=${encodeURIComponent(reviewQuery)}&per_page=50`
	);
	for (const pr of reviewResult.items) {
		prs.push(toPRCard(pr, false));
	}

	// 2. PRs created by user (own PRs)
	const ownQuery = `is:pr is:open author:${user}`;
	const ownResult = await ghFetch<GHSearchResponse>(
		token,
		`/search/issues?q=${encodeURIComponent(ownQuery)}&per_page=50`
	);
	for (const pr of ownResult.items) {
		if (!prs.find((p) => p.id === prKey(pr))) {
			prs.push(toPRCard(pr, true));
		}
	}

	return prs;
}

function toPRCard(pr: GHPR, isOwnPR: boolean): PRCard {
	const repo = pr.repository_url.split('/repos/')[1] || 'unknown';
	return {
		id: prKey(pr),
		prNumber: pr.number,
		repo,
		title: pr.title,
		author: pr.user?.login || 'unknown',
		url: pr.html_url,
		updatedAt: pr.updated_at,
		isOwnPR,
		columnId: 'to-review'
	};
}

function prKey(pr: GHPR): string {
	const repo = pr.repository_url.split('/repos/')[1] || 'unknown';
	return `pr_${repo.replace('/', '_')}_${pr.number}`;
}

export async function fetchOwnedRepos(
	token: string,
	user: string,
	query: string
): Promise<string[]> {
	const orgs = await fetchUserOrgs(token, user);
	const parts = [`user:${user}`, ...orgs.map((o) => `org:${o}`)];
	if (query) parts.push(query);
	const q = parts.join(' ');
	const res = await ghFetch<GHRepoSearchResponse>(
		token,
		`/search/repositories?q=${encodeURIComponent(q)}&per_page=100`
	);
	return res.items.filter((r) => !r.archived).map((r) => r.full_name);
}
