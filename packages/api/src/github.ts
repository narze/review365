import type { PRCard, Signal } from './types';

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
	state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
	submitted_at: string;
}

interface GHPullDetail {
	merged: boolean;
	merged_at: string | null;
	state: 'open' | 'closed';
	draft: boolean;
}

let orgsCache: { user: string; orgs: string[]; ts: number } | null = null;
const ORGS_TTL_MS = 5 * 60 * 1000;

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

function prKey(pr: GHPR): string {
	const repo = pr.repository_url.split('/repos/')[1] || 'unknown';
	return `pr_${repo.replace('/', '_')}_${pr.number}`;
}

function toPRCard(pr: GHPR, isOwnPR: boolean, signals: Signal[] = []): PRCard {
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
		columnId: 'inbox',
		signals,
		archived: false
	};
}

async function fetchUserOrgs(token: string, user: string): Promise<string[]> {
	if (orgsCache && orgsCache.user === user && Date.now() - orgsCache.ts < ORGS_TTL_MS) {
		return orgsCache.orgs;
	}
	const orgs = await ghFetch<GHOrg[]>(token, `/users/${user}/orgs?per_page=100`);
	const logins = orgs.map((o) => o.login);
	orgsCache = { user, orgs: logins, ts: Date.now() };
	return logins;
}

export async function fetchPRs(
	token: string,
	user: string,
	enabledRepos: string[] = []
): Promise<PRCard[]> {
	const cardMap = new Map<string, PRCard & { signals: Signal[] }>();

	// 1. PRs where user is requested as reviewer
	const reviewQuery = `is:pr is:open review-requested:${user}`;
	const reviewResult = await ghFetch<GHSearchResponse>(
		token,
		`/search/issues?q=${encodeURIComponent(reviewQuery)}&per_page=50`
	);
	for (const pr of reviewResult.items) {
		const id = prKey(pr);
		const signals: Signal[] = ['pr-open', 'review-requested'];
		if (pr.draft) signals.push('draft');
		cardMap.set(id, { ...toPRCard(pr, false), signals });
	}

	// 2. PRs created by user (own PRs)
	const ownQuery = `is:pr is:open author:${user}`;
	const ownResult = await ghFetch<GHSearchResponse>(
		token,
		`/search/issues?q=${encodeURIComponent(ownQuery)}&per_page=50`
	);
	for (const pr of ownResult.items) {
		const id = prKey(pr);
		if (!cardMap.has(id)) {
			const signals: Signal[] = ['pr-open', 'own-pr'];
			if (pr.draft) signals.push('draft');
			cardMap.set(id, { ...toPRCard(pr, true), signals });
		}
	}

	// 3. Recently merged PRs (own)
	const mergedQuery = `is:pr is:merged author:${user}`;
	const mergedResult = await ghFetch<GHSearchResponse>(
		token,
		`/search/issues?q=${encodeURIComponent(mergedQuery)}&per_page=20`
	);
	for (const pr of mergedResult.items) {
		const id = prKey(pr);
		if (!cardMap.has(id)) {
			cardMap.set(id, { ...toPRCard(pr, true), signals: ['merged', 'own-pr'] });
		} else {
			const existing = cardMap.get(id)!;
			if (!existing.signals.includes('merged')) existing.signals.push('merged');
		}
	}

	// 4. Fetch review status only for PRs in the watchlist (avoids N API calls for all PRs)
	if (enabledRepos.length > 0) {
		await enrichWithReviewSignals(token, cardMap, user, enabledRepos);
	}

	return [...cardMap.values()];
}

async function enrichWithReviewSignals(
	token: string,
	cardMap: Map<string, PRCard & { signals: Signal[] }>,
	user: string,
	enabledRepos: string[]
) {
	const watchlisted = [...cardMap.values()].filter(
		(c) => !c.signals.includes('merged') && enabledRepos.includes(c.repo)
	);
	for (const card of watchlisted) {
		try {
			const reviews = await ghFetch<GHReview[]>(
				token,
				`/repos/${card.repo}/pulls/${card.prNumber}/reviews?per_page=100`
			);
			const myReviews = reviews
				.filter((r) => r.user?.login === user)
				.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
			const lastReview = myReviews[myReviews.length - 1];

			if (lastReview) {
				if (lastReview.state === 'APPROVED') {
					card.signals.push('approved');
				} else if (lastReview.state === 'CHANGES_REQUESTED') {
					card.signals.push('changes-requested');
				}
			}

			if (card.isOwnPR) {
				const otherApprovals = reviews
					.filter((r) => r.user?.login !== user && r.state === 'APPROVED')
					.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
				if (otherApprovals.length > 0 && !card.signals.includes('approved')) {
					card.signals.push('approved');
				}
				const otherChanges = reviews
					.filter((r) => r.user?.login !== user && r.state === 'CHANGES_REQUESTED')
					.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
				if (otherChanges.length > 0 && !card.signals.includes('changes-requested')) {
					card.signals.push('changes-requested');
				}
			}
		} catch {
			// PR may be from a repo we can't access reviews for
		}
	}
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
