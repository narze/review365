import type { BoardStore } from "@review365/api/store";
import type { ConfigStore, BoardConfig } from "@review365/api/config";
import { createDefaultConfig } from "@review365/api/config";
import type { BoardState } from "@review365/api/types";

export const BOARD_KEY = "review365:board";
export const CONFIG_KEY = "review365:config";

export class LocalBoardStore implements BoardStore {
  async load(): Promise<BoardState> {
    try {
      const data = localStorage.getItem(BOARD_KEY);
      if (!data) return { cards: {} };
      return JSON.parse(data) as BoardState;
    } catch {
      return { cards: {} };
    }
  }

  async save(state: BoardState): Promise<void> {
    localStorage.setItem(BOARD_KEY, JSON.stringify(state));
  }
}

export class LocalConfigStore implements ConfigStore {
  async load(): Promise<BoardConfig> {
    try {
      const data = localStorage.getItem(CONFIG_KEY);
      if (!data) return createDefaultConfig();
      return JSON.parse(data) as BoardConfig;
    } catch {
      return createDefaultConfig();
    }
  }

  async save(config: BoardConfig): Promise<void> {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }
}

export const boardStore = new LocalBoardStore();
export const configStore = new LocalConfigStore();
