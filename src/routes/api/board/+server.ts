import { json, type RequestEvent } from '@sveltejs/kit';
import type { ColumnId } from '$lib/types';
import { loadBoardState, saveBoardState, setCardColumn } from '$lib/server/board';

export async function GET({ platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	if (!r2) return json({ error: 'R2 not configured' }, { status: 500 });
	const state = await loadBoardState(r2);
	return json(state);
}

export async function POST({ request, platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	if (!r2) return json({ error: 'R2 not configured' }, { status: 500 });

	const { cardId, column }: { cardId: string; column: ColumnId } = await request.json();
	const state = await loadBoardState(r2);
	const updated = setCardColumn(state, cardId, column);
	await saveBoardState(r2, updated);

	return json(updated);
}
