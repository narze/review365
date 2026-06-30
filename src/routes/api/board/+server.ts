import { json, type RequestEvent } from '@sveltejs/kit';
import type { ColumnId, BoardState } from '$lib/types';
import { loadBoardState, saveBoardState, setCardColumn } from '$lib/server/board';

const BOARD_FILE = '.hermes/review365-board.json';

async function loadLocalBoard(): Promise<BoardState> {
	try {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const home = process.env.HOME || '/tmp';
		const file = path.join(home, BOARD_FILE);
		const data = await fs.readFile(file, 'utf-8');
		return JSON.parse(data);
	} catch {
		return { cards: {} };
	}
}

async function saveLocalBoard(state: BoardState): Promise<void> {
	const fs = await import('node:fs/promises');
	const path = await import('node:path');
	const home = process.env.HOME || '/tmp';
	const dir = path.join(home, '.hermes');
	await fs.mkdir(dir, { recursive: true });
	const file = path.join(dir, 'review365-board.json');
	await fs.writeFile(file, JSON.stringify(state, null, 2));
}

export async function GET({ platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	const state = r2 ? await loadBoardState(r2) : await loadLocalBoard();
	return json(state);
}

export async function POST({ request, platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;

	const { cardId, column }: { cardId: string; column: ColumnId } = await request.json();

	const state = r2 ? await loadBoardState(r2) : await loadLocalBoard();
	const updated = setCardColumn(state, cardId, column);

	if (r2) {
		await saveBoardState(r2, updated);
	} else {
		await saveLocalBoard(updated);
	}

	return json(updated);
}
