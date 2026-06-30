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
