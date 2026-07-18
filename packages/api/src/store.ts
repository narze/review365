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

  const cards = { ...state.cards };
  if (exists) {
    const slug = repo.replaceAll("/", "_");
    const prefixes = [`pr_${slug}_`, `mr_${slug}_`];
    for (const key of Object.keys(cards)) {
      if (prefixes.some((p) => key.startsWith(p))) delete cards[key];
    }
  }

  return { cards, enabledRepos };
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

/**
 * Ensure every card in the current fetch has a `firstSeenAt` timestamp.
 * New cards get `now`; existing cards keep their original timestamp.
 * Returns a new state object; safe to call every refresh.
 */
export function stampFirstSeen(state: BoardState, cardIds: string[], now = Date.now()): BoardState {
  const iso = new Date(now).toISOString();
  const cards = { ...state.cards };
  let changed = false;

  for (const id of cardIds) {
    const entry = cards[id];
    if (!entry) {
      // Brand new card — create a minimal entry so firstSeenAt persists even
      // before the user drags it. column falls back via getCardColumn.
      cards[id] = { column: "inbox", order: now, firstSeenAt: iso };
      changed = true;
    } else if (!entry.firstSeenAt) {
      cards[id] = { ...entry, firstSeenAt: iso };
      changed = true;
    }
  }

  return changed ? { ...state, cards } : state;
}

/**
 * Drop state entries for cards that no longer appear in the fetch result
 * (PR closed/merged/disappeared). Keeps note/manual moves ONLY if the card
 * is still being fetched. Archived cards are pruned too — closed PRs don't
 * need archived state.
 */
export function pruneMissingCards(state: BoardState, currentCardIds: string[]): BoardState {
  const keep = new Set(currentCardIds);
  const cards: typeof state.cards = {};
  let changed = false;

  for (const [id, entry] of Object.entries(state.cards)) {
    if (keep.has(id)) {
      cards[id] = entry;
    } else {
      changed = true;
    }
  }

  return changed ? { ...state, cards } : state;
}

/**
 * SLA age in whole days, based on the earlier of `firstSeenAt` (when Review365
 * first showed the card) and the PR's `updatedAt` on the platform. We pick the
 * EARLIER timestamp because a PR that's been ignored locally but touched
 * recently on GitHub is still "active" — the relevant SLA clock is when the
 * reviewer became responsible.
 *
 * Falls back to `updatedAt` if `firstSeenAt` is missing (legacy cards).
 */
export function slaAgeDays(firstSeenAt: string | undefined, updatedAt: string, now = Date.now()): number {
  const updatedMs = new Date(updatedAt).getTime();
  const seenMs = firstSeenAt ? new Date(firstSeenAt).getTime() : updatedMs;
  const earliest = Math.min(updatedMs, seenMs);
  return Math.max(0, Math.floor((now - earliest) / 86400000));
}

export type SlaLevel = "fresh" | "warning" | "critical";

/**
 * Map an SLA age to a level using config thresholds. Defaults to 3/7 days.
 * Critical wins if both are equal/missing.
 */
export function slaLevel(ageDays: number, config: { slaWarningDays?: number; slaCriticalDays?: number }): SlaLevel {
  const warning = config.slaWarningDays ?? 3;
  const critical = config.slaCriticalDays ?? 7;
  if (ageDays >= critical) return "critical";
  if (ageDays >= warning) return "warning";
  return "fresh";
}
