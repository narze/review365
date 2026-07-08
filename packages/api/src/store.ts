import type { BoardState, ColumnId, BoardConfig, AutomationRule, Signal } from "./types";

export interface BoardStore {
  load(): Promise<BoardState>;
  save(state: BoardState): Promise<void>;
}

export function getCardColumn(state: BoardState, cardId: string): ColumnId {
  return state.cards[cardId]?.column ?? "inbox";
}

export function setCardColumn(state: BoardState, cardId: string, column: ColumnId): BoardState {
  return {
    ...state,
    cards: {
      ...state.cards,
      [cardId]: { ...state.cards[cardId], column, order: Date.now(), manual: true },
    },
  };
}

export function reorderCard(
  state: BoardState,
  cardId: string,
  targetCardId: string | null,
  column: ColumnId,
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
    { ...existing, column, order: now, manual: true },
  ];

  colCards.splice(insertIdx, 0, movedEntry);

  colCards.forEach(([id], i) => {
    cards[id] = { ...cards[id], column, order: now + i, manual: true };
  });

  return { ...state, cards };
}

export function updateNote(state: BoardState, cardId: string, note: string): BoardState {
  if (note.length > 200) note = note.slice(0, 200);
  return {
    ...state,
    cards: {
      ...state.cards,
      [cardId]: { ...state.cards[cardId], note: note || undefined },
    },
  };
}

export function archiveCard(state: BoardState, cardId: string): BoardState {
  return {
    ...state,
    cards: {
      ...state.cards,
      [cardId]: { ...state.cards[cardId], archived: true },
    },
  };
}

export function unarchiveCard(state: BoardState, cardId: string): BoardState {
  const card = state.cards[cardId];
  if (!card) return state;
  const { archived: _archived, ...rest } = card;
  return {
    ...state,
    cards: {
      ...state.cards,
      [cardId]: rest,
    },
  };
}

export function getEnabledRepos(state: BoardState): string[] {
  return state.enabledRepos ?? [];
}

export function toggleRepo(state: BoardState, repo: string): BoardState {
  const current = getEnabledRepos(state);
  const exists = current.includes(repo);
  const enabledRepos = exists ? current.filter((r) => r !== repo) : [...current, repo];

  // Keep card state (column, notes, manual placement) around while a repo is
  // unwatched, so re-watching it later restores exactly where things were left.
  return { ...state, enabledRepos };
}

export function findOrphanedCards(
  state: BoardState,
  config: BoardConfig,
): { cardId: string; column: ColumnId }[] {
  const validIds = new Set(config.columns.map((c) => c.id));
  return Object.entries(state.cards)
    .filter(([_, card]) => !validIds.has(card.column))
    .map(([cardId, card]) => ({ cardId, column: card.column }));
}

export function applyAutomation(
  state: BoardState,
  cardSignals: Record<string, Signal[]>,
  rules: AutomationRule[],
): BoardState {
  const updated = { ...state, cards: { ...state.cards } };

  for (const [cardId, signals] of Object.entries(cardSignals)) {
    if (updated.cards[cardId]?.archived) continue;
    const isManual = updated.cards[cardId]?.manual;
    for (const rule of rules) {
      if (isManual && rule.signal !== "merged") continue;
      if (signals.includes(rule.signal)) {
        updated.cards[cardId] = {
          ...updated.cards[cardId],
          column: rule.columnId,
          order: updated.cards[cardId]?.order ?? Date.now(),
        };
        break;
      }
    }
  }

  return updated;
}
