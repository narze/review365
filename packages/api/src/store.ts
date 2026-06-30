import type { BoardState, ColumnId, BoardConfig, AutomationRule, Signal } from './types';

export interface BoardStore {
	load(): Promise<BoardState>;
	save(state: BoardState): Promise<void>;
}

export function getCardColumn(state: BoardState, cardId: string): ColumnId {
	return state.cards[cardId]?.column ?? 'inbox';
}

export function setCardColumn(state: BoardState, cardId: string, column: ColumnId): BoardState {
	return {
		...state,
		cards: {
			...state.cards,
			[cardId]: { ...state.cards[cardId], column, order: Date.now(), manual: true }
		}
	};
}

export function reorderCard(
	state: BoardState,
	cardId: string,
	targetCardId: string | null,
	column: ColumnId
): BoardState {
	const cards = { ...state.cards };
	const existing = cards[cardId];

	const colCards = Object.entries(cards)
		.filter(([id, c]) => c.column === column && !c.archived && id !== cardId)
		.sort((a, b) => a[1].order - b[1].order);

	let insertIdx = colCards.length;
	if (targetCardId) {
		const targetIdx = colCards.findIndex(([id]) => id === targetCardId);
		if (targetIdx >= 0) insertIdx = targetIdx;
	}

	const now = Date.now();
	const movedEntry: [string, typeof existing] = [
		cardId,
		{ ...existing, column, order: now, manual: true }
	];

	colCards.splice(insertIdx, 0, movedEntry);

	colCards.forEach(([id], i) => {
		cards[id] = { ...cards[id], column, order: now + i, manual: true };
	});

	return { ...state, cards };
}

export function archiveCard(state: BoardState, cardId: string): BoardState {
	return {
		...state,
		cards: {
			...state.cards,
			[cardId]: { ...state.cards[cardId], archived: true }
		}
	};
}

export function unarchiveCard(state: BoardState, cardId: string): BoardState {
	const card = state.cards[cardId];
	if (!card) return state;
	const { archived, ...rest } = card;
	return {
		...state,
		cards: {
			...state.cards,
			[cardId]: rest
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

export function findOrphanedCards(
	state: BoardState,
	config: BoardConfig
): { cardId: string; column: ColumnId }[] {
	const validIds = new Set(config.columns.map((c) => c.id));
	return Object.entries(state.cards)
		.filter(([_, card]) => !validIds.has(card.column))
		.map(([cardId, card]) => ({ cardId, column: card.column }));
}

export function applyAutomation(
	state: BoardState,
	cardSignals: Record<string, Signal[]>,
	rules: AutomationRule[]
): BoardState {
	const updated = { ...state, cards: { ...state.cards } };

	for (const [cardId, signals] of Object.entries(cardSignals)) {
		if (updated.cards[cardId]?.archived) continue;
		if (updated.cards[cardId]?.manual) continue;
		for (const rule of rules) {
			if (signals.includes(rule.signal)) {
				updated.cards[cardId] = {
					...updated.cards[cardId],
					column: rule.columnId,
					order: updated.cards[cardId]?.order ?? Date.now()
				};
				break;
			}
		}
	}

	return updated;
}
