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

export class LocalBoardStore implements BoardStore {
  async load(): Promise<BoardState> {
    try {
      const data = localStorage.getItem(boardKey());
      if (!data) return { cards: {} };
      return JSON.parse(data) as BoardState;
    } catch {
      return { cards: {} };
    }
  }

  async save(state: BoardState): Promise<void> {
    localStorage.setItem(boardKey(), JSON.stringify(state));
  }
}

export class LocalConfigStore implements ConfigStore {
  async load(): Promise<BoardConfig> {
    try {
      const data = localStorage.getItem(configKey());
      if (!data) return createDefaultConfig();
      return JSON.parse(data) as BoardConfig;
    } catch {
      return createDefaultConfig();
    }
  }

  async save(config: BoardConfig): Promise<void> {
    localStorage.setItem(configKey(), JSON.stringify(config));
  }
}

export const boardStore = new LocalBoardStore();
export const configStore = new LocalConfigStore();
