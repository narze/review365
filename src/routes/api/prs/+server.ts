import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { fetchPRs } from '$lib/server/github';
import { loadBoardState, getCardColumn } from '$lib/server/board';
import { COLUMNS } from '$lib/types';

export async function GET({ platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	const token = env.GITHUB_TOKEN;
	const user = env.GITHUB_USER || 'narze';

	if (!token) return json({ error: 'GITHUB_TOKEN not set' }, { status: 500 });

	const prs = await fetchPRs(token, user);
	const boardState = r2 ? await loadBoardState(r2) : await loadLocalBoard();

	const cards = prs.map((pr) => ({
		...pr,
		columnId: getCardColumn(boardState, pr.id)
	}));

	return json({ columns: COLUMNS, cards });
}

async function loadLocalBoard() {
	// Fallback for local dev: use .hermes/review365-board.json
	try {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const home = process.env.HOME || '/tmp';
		const file = path.join(home, '.hermes', 'review365-board.json');
		const data = await fs.readFile(file, 'utf-8');
		return JSON.parse(data);
	} catch {
		return { cards: {} };
	}
}
