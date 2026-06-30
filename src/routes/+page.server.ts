import type { PRCard } from '$lib/types';
import { COLUMNS } from '$lib/types';

export async function load({ fetch }) {
	const res = await fetch('/api/prs');
	const data = (await res.json()) as {
		columns: typeof COLUMNS;
		cards: PRCard[];
		enabledRepos: string[];
	};
	return { columns: data.columns, cards: data.cards, enabledRepos: data.enabledRepos };
}
