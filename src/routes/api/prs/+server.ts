import { json, type RequestEvent } from '@sveltejs/kit';
import { fetchPRs } from '$lib/server/github';
import { loadBoardState, getCardColumn } from '$lib/server/board';
import { COLUMNS } from '$lib/types';

export async function GET({ platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	const token = platform?.env?.GITHUB_TOKEN;
	const user = platform?.env?.GITHUB_USER || 'narze';

	if (!token) return json({ error: 'GITHUB_TOKEN not set' }, { status: 500 });

	const prs = await fetchPRs(token, user);
	const boardState = r2 ? await loadBoardState(r2) : { cards: {} };

	const cards = prs.map((pr) => ({
		...pr,
		columnId: getCardColumn(boardState, pr.id)
	}));

	return json({ columns: COLUMNS, cards });
}
