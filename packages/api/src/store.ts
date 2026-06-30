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
		for (const rule of rules) {
			if (signals.includes(rule.signal)) {
				updated.cards[cardId] = {
					column: rule.columnId,
					order: updated.cards[cardId]?.order ?? Date.now()
				};
				break;
			}
		}
	}

	return updated;
}
