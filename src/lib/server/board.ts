import type { R2Bucket } from '@cloudflare/workers-types';
import type { BoardState, ColumnId } from '$lib/types';

const BOARD_KEY = 'board-state.json';

export async function loadBoardState(r2: R2Bucket): Promise<BoardState> {
	const obj = await r2.get(BOARD_KEY);
	if (!obj) return { cards: {} };
	return JSON.parse(await obj.text());
}

export async function saveBoardState(r2: R2Bucket, state: BoardState): Promise<void> {
	await r2.put(BOARD_KEY, JSON.stringify(state));
}

export function getCardColumn(state: BoardState, cardId: string): ColumnId {
	return state.cards[cardId]?.column ?? 'to-review';
}

export function setCardColumn(state: BoardState, cardId: string, column: ColumnId): BoardState {
	return {
		...state,
		cards: {
			...state.cards,
			[cardId]: { column, order: Date.now() }
		}
	};
}
