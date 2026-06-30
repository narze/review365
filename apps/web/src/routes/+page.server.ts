import { client } from '$lib/orpc';

export async function load() {
	const data = await client.prs.list();
	return {
		columns: data.columns,
		cards: data.cards,
		enabledRepos: data.enabledRepos,
		rules: data.rules,
		orphans: data.orphans,
		signalLabels: data.signalLabels
	};
}
