import type { BoardConfig, AutomationRule, Signal, SortMode } from "./types";
import { DEFAULT_CONFIG } from "./types";

export type { BoardConfig };
export interface ConfigStore {
  load(): Promise<BoardConfig>;
  save(config: BoardConfig): Promise<void>;
}

export function createDefaultConfig(): BoardConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function addColumn(config: BoardConfig, title: string): BoardConfig {
  const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...config,
    columns: [...config.columns, { id, title }],
  };
}

export function renameColumn(config: BoardConfig, id: string, title: string): BoardConfig {
  return {
    ...config,
    columns: config.columns.map((c) => (c.id === id ? { ...c, title } : c)),
  };
}

export function deleteColumn(config: BoardConfig, id: string): BoardConfig {
  return {
    ...config,
    columns: config.columns.filter((c) => c.id !== id),
    rules: config.rules.filter((r) => r.columnId !== id),
  };
}

export function reorderColumns(config: BoardConfig, ids: string[]): BoardConfig {
  const map = new Map(config.columns.map((c) => [c.id, c]));
  return {
    ...config,
    columns: ids.map((id) => map.get(id)!).filter(Boolean),
  };
}

export function addRule(config: BoardConfig, signal: Signal, columnId: string): BoardConfig {
  const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...config,
    rules: [...config.rules, { id, signal, columnId }],
  };
}

export function deleteRule(config: BoardConfig, id: string): BoardConfig {
  return {
    ...config,
    rules: config.rules.filter((r) => r.id !== id),
  };
}

export function setColumnWidth(config: BoardConfig, px: number): BoardConfig {
  return {
    ...config,
    columnWidthPx: Math.min(800, Math.max(200, px)),
  };
}

export function setColumnSort(config: BoardConfig, id: string, mode: SortMode): BoardConfig {
  return {
    ...config,
    columns: config.columns.map((c) => {
      if (c.id !== id) return c;
      if (mode === "default") {
        const { sortMode: _sortMode, ...rest } = c;
        return rest;
      }
      return { ...c, sortMode: mode };
    }),
  };
}

export function setColumnGrouped(config: BoardConfig, id: string, grouped: boolean): BoardConfig {
  return {
    ...config,
    columns: config.columns.map((c) => {
      if (c.id !== id) return c;
      if (!grouped) {
        const { grouped: _grouped, ...rest } = c;
        return rest;
      }
      return { ...c, grouped: true };
    }),
  };
}
