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

export function getEnabledRepos(state: BoardState): string[] {
	return state.enabledRepos ?? [];
}

export function toggleRepo(state: BoardState, repo: string): BoardState {
	const current = getEnabledRepos(state);
	const exists = current.includes(repo);
	const enabledRepos = exists ? current.filter((r) => r !== repo) : [...current, repo];

	const cards = { ...state.cards };
	if (exists) {
		const prefix = `pr_${repo.replace('/', '_')}_`;
		for (const key of Object.keys(cards)) {
			if (key.startsWith(prefix)) delete cards[key];
		}
	}

	return { cards, enabledRepos };
}

export function setRepos(state: BoardState, repos: string[]): BoardState {
	return { ...state, enabledRepos: repos };
}
