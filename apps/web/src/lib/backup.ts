import type { BoardState } from "@review365/api/types";
import type { BoardConfig } from "@review365/api/config";
import { boardStore, configStore } from "./local-store";

export interface BackupData {
  board: BoardState;
  config: BoardConfig;
}

export async function exportData(): Promise<string> {
  const [board, config] = await Promise.all([boardStore.load(), configStore.load()]);
  return JSON.stringify({ board, config } satisfies BackupData, null, 2);
}

/**
 * Imports a backup. Accepts three shapes:
 * - combined export: `{ board, config }`
 * - bare BoardState (legacy board.json): `{ cards, enabledRepos? }`
 * - bare BoardConfig (legacy board-config.json): `{ columns, rules }`
 * Returns which parts were imported.
 */
export async function importData(json: string): Promise<{ board: boolean; config: boolean }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unrecognized backup format");
  }

  const data = parsed as Record<string, unknown>;
  const imported = { board: false, config: false };

  if (isBoardState(data.board)) {
    await boardStore.save(data.board);
    imported.board = true;
  }
  if (isBoardConfig(data.config)) {
    await configStore.save(data.config);
    imported.config = true;
  }
  if (!imported.board && isBoardState(data)) {
    await boardStore.save(data as unknown as BoardState);
    imported.board = true;
  }
  if (!imported.config && isBoardConfig(data)) {
    await configStore.save(data as unknown as BoardConfig);
    imported.config = true;
  }

  if (!imported.board && !imported.config) {
    throw new Error("Unrecognized backup format");
  }
  return imported;
}

function isBoardState(value: unknown): value is BoardState {
  return (
    typeof value === "object" &&
    value !== null &&
    "cards" in value &&
    typeof (value as BoardState).cards === "object" &&
    !Array.isArray((value as BoardState).cards) &&
    !("columns" in value)
  );
}

function isBoardConfig(value: unknown): value is BoardConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as BoardConfig).columns) &&
    Array.isArray((value as BoardConfig).rules)
  );
}
