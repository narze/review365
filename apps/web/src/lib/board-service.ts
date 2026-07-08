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
import type { BoardState, ColumnId, Signal } from "@review365/api/types";
import type { BoardConfig } from "@review365/api/config";
import { boardStore, configStore } from "./local-store";
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

export type BoardSnapshot = Awaited<ReturnType<typeof listPRs>>;

function snapshotKey(platform: Platform = getPlatform()): string {
  return `review365:snapshot:${platform}`;
}

/**
 * Last board this platform successfully loaded. Lets the UI paint the previous
 * cards/columns immediately on mount instead of a blank state while `listPRs`
 * makes its network round trip.
 */
export function loadCachedBoard(): BoardSnapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey());
    return raw ? (JSON.parse(raw) as BoardSnapshot) : null;
  } catch {
    return null;
  }
}

function cacheBoard(snapshot: BoardSnapshot): void {
  try {
    localStorage.setItem(snapshotKey(), JSON.stringify(snapshot));
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

  const result = {
    columns: config.columns,
    cards,
    enabledRepos: getEnabledRepos(automatedState),
    rules: config.rules,
    orphans,
    signalLabels: SIGNAL_LABELS,
    mergedRetentionDays: config.mergedRetentionDays ?? 14,
  };
  cacheBoard(result);
  return result;
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
