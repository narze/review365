import { getProvider } from "@review365/api/providers";
import type { ProviderContext } from "@review365/api/providers";
import {
  getCardColumn,
  setCardColumn,
  getEnabledRepos,
  toggleRepo,
  applyAutomation,
  findOrphanedCards,
  reorderCard,
  archiveCard,
  unarchiveCard,
  updateNote,
} from "@review365/api/store";
import {
  addColumn,
  renameColumn,
  deleteColumn,
  reorderColumns,
  addRule,
  deleteRule,
} from "@review365/api/config";
import { SIGNAL_LABELS } from "@review365/api/types";
import type { BoardState, ColumnId, PRCard, Signal } from "@review365/api/types";
import type { BoardConfig } from "@review365/api/config";
import { boardStore, configStore, loadBoardState, loadBoardConfig } from "./local-store";
import { getToken, getLogin, getHost, getPlatform } from "./auth";
import type { Platform } from "@review365/api/types";

function credentials(): { platform: Platform; ctx: ProviderContext } {
  const platform = getPlatform();
  const token = getToken(platform);
  const user = getLogin(platform);
  if (!token || !user) throw new Error("Not signed in");
  const host = getHost(platform) ?? undefined;
  return { platform, ctx: { token, user, host } };
}

/**
 * Repos/columns/rules/retention are pure local config — never worth round-tripping
 * through a fetch response, since a slow or in-flight `listPRs` call would otherwise
 * resolve with whatever this looked like when the fetch *started* and clobber any
 * edit (toggle a repo, rename a column) made in the meantime. Read fresh every time.
 */
export function loadLocalBoard() {
  const config = loadBoardConfig();
  const state = loadBoardState();
  return {
    columns: config.columns,
    enabledRepos: getEnabledRepos(state),
    rules: config.rules,
    orphans: findOrphanedCards(state, config),
    signalLabels: SIGNAL_LABELS,
    mergedRetentionDays: config.mergedRetentionDays ?? 14,
  };
}

function cardsCacheKey(platform: Platform = getPlatform()): string {
  return `review365:cards:${platform}`;
}

function loadCachedCardsRaw(): PRCard[] | null {
  try {
    const raw = localStorage.getItem(cardsCacheKey());
    return raw ? (JSON.parse(raw) as PRCard[]) : null;
  } catch {
    return null;
  }
}

/** Whether this platform has ever completed a fetch, so callers can tell "loading" apart from "genuinely no PRs". */
export function hasCachedCards(): boolean {
  return loadCachedCardsRaw() !== null;
}

/**
 * PR cards from the last successful fetch — the only thing that genuinely needs the
 * network, since it's live PR/MR data. Re-applies the current column/archived/note
 * so a reload reflects local edits made since that fetch, not the stale snapshot of them.
 */
export function loadCachedCards(): PRCard[] {
  const cached = loadCachedCardsRaw();
  if (!cached) return [];
  const state = loadBoardState();
  return cached.map((pr) => ({
    ...pr,
    columnId: getCardColumn(state, pr.id),
    archived: state.cards[pr.id]?.archived ?? false,
    order: state.cards[pr.id]?.order ?? pr.order,
    note: state.cards[pr.id]?.note,
  }));
}

function cacheCards(cards: PRCard[]): void {
  try {
    localStorage.setItem(cardsCacheKey(), JSON.stringify(cards));
  } catch {
    // storage full or unavailable; skip caching
  }
}

export async function listPRs(force = false) {
  const { platform, ctx } = credentials();
  const config = await configStore.load();
  const state = await boardStore.load();

  const prs = await getProvider(platform).fetchPRs(
    ctx,
    getEnabledRepos(state),
    force,
    config.mergedRetentionDays ?? 14,
  );

  const cardSignals: Record<string, Signal[]> = {};
  for (const pr of prs) {
    cardSignals[pr.id] = pr.signals;
  }

  const automatedState = applyAutomation(state, cardSignals, config.rules);

  const changed = JSON.stringify(automatedState) !== JSON.stringify(state);
  if (changed) {
    await boardStore.save(automatedState);
  }

  const cards = prs.map((pr) => ({
    ...pr,
    columnId: getCardColumn(automatedState, pr.id),
    archived: automatedState.cards[pr.id]?.archived ?? false,
    order: automatedState.cards[pr.id]?.order ?? Date.now(),
    note: automatedState.cards[pr.id]?.note,
  }));

  const orphans = findOrphanedCards(automatedState, config);

  cacheCards(cards);

  return {
    cards,
    orphans,
    signalLabels: SIGNAL_LABELS,
  };
}

export async function searchRepos(q: string): Promise<string[]> {
  const { platform, ctx } = credentials();
  return getProvider(platform).fetchOwnedRepos(ctx, q);
}

async function mutateBoard(fn: (state: BoardState) => BoardState): Promise<BoardState> {
  const state = await boardStore.load();
  const updated = fn(state);
  await boardStore.save(updated);
  return updated;
}

export const board = {
  moveCard: (cardId: string, column: string) =>
    mutateBoard((s) => setCardColumn(s, cardId, column as ColumnId)),
  toggleRepo: (repo: string) => mutateBoard((s) => toggleRepo(s, repo)),
  reorderCard: (cardId: string, targetCardId: string | null, column: string) =>
    mutateBoard((s) => reorderCard(s, cardId, targetCardId, column as ColumnId)),
  archiveCard: (cardId: string) => mutateBoard((s) => archiveCard(s, cardId)),
  unarchiveCard: (cardId: string) => mutateBoard((s) => unarchiveCard(s, cardId)),
  updateNote: (cardId: string, note: string) =>
    mutateBoard((s) => updateNote(s, cardId, note.slice(0, 200))),
};

async function mutateConfig(fn: (config: BoardConfig) => BoardConfig): Promise<BoardConfig> {
  const config = await configStore.load();
  const updated = fn(config);
  await configStore.save(updated);
  return updated;
}

export const config = {
  get: () => configStore.load(),
  addColumn: (title: string) => mutateConfig((c) => addColumn(c, title)),
  renameColumn: (id: string, title: string) => mutateConfig((c) => renameColumn(c, id, title)),
  deleteColumn: (id: string) => mutateConfig((c) => deleteColumn(c, id)),
  reorderColumns: (ids: string[]) => mutateConfig((c) => reorderColumns(c, ids)),
  addRule: (signal: Signal, columnId: string) => mutateConfig((c) => addRule(c, signal, columnId)),
  deleteRule: (id: string) => mutateConfig((c) => deleteRule(c, id)),
  setRetention: (days: number) =>
    mutateConfig((c) => ({ ...c, mergedRetentionDays: Math.min(90, Math.max(1, days)) })),
};
