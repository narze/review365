import type { BoardStore } from "@review365/api/store";
import type { ConfigStore, BoardConfig } from "@review365/api/config";
import { createDefaultConfig } from "@review365/api/config";
import type { BoardState, Platform } from "@review365/api/types";
import { getPlatform } from "./auth";

const BOARD_BASE = "review365:board";
const CONFIG_BASE = "review365:config";

/** Each platform keeps its own board. GitHub uses the original unprefixed keys for backward compatibility. */
function scopedKey(base: string, platform: Platform = getPlatform()): string {
  return platform === "github" ? base : `${base}:${platform}`;
}

export function boardKey(platform?: Platform): string {
  return scopedKey(BOARD_BASE, platform);
}

export function configKey(platform?: Platform): string {
  return scopedKey(CONFIG_BASE, platform);
}

/**
 * Synchronous reads of the board/config, for callers that need them before an
 * async round trip makes sense (e.g. painting initial UI state on mount). Board
 * and config are pure localStorage — never worth caching separately, since a
 * separate cache can only ever be as fresh as the last time it was written, and
 * would go stale the moment a local edit (toggle a repo, move a card) landed
 * without also refreshing that cache.
 */
export function loadBoardState(): BoardState {
  try {
    const data = localStorage.getItem(boardKey());
    return data ? (JSON.parse(data) as BoardState) : { cards: {} };
  } catch {
    return { cards: {} };
  }
}

export function loadBoardConfig(): BoardConfig {
  try {
    const data = localStorage.getItem(configKey());
    return data ? (JSON.parse(data) as BoardConfig) : createDefaultConfig();
  } catch {
    return createDefaultConfig();
  }
}

export class LocalBoardStore implements BoardStore {
  async load(): Promise<BoardState> {
    return loadBoardState();
  }

  async save(state: BoardState): Promise<void> {
    localStorage.setItem(boardKey(), JSON.stringify(state));
  }
}

export class LocalConfigStore implements ConfigStore {
  async load(): Promise<BoardConfig> {
    return loadBoardConfig();
  }

  async save(config: BoardConfig): Promise<void> {
    localStorage.setItem(configKey(), JSON.stringify(config));
  }
}

export const boardStore = new LocalBoardStore();
export const configStore = new LocalConfigStore();
