export type ColumnId = string;

export type Platform = "github" | "gitlab";

export type CIState = "success" | "failure" | "pending";

export interface CICheck {
  name: string;
  state: CIState;
}

export interface CIStatus {
  state: CIState;
  total: number;
  failing?: string[];
  checks: CICheck[];
}

export type Signal =
  | "pr-open"
  | "review-requested"
  | "own-pr"
  | "draft"
  | "merged"
  | "closed"
  | "approved"
  | "changes-requested";

export type SortMode = "default" | "pr-asc" | "pr-desc" | "age-asc" | "age-desc";

export interface ColumnDef {
  id: string;
  title: string;
  /** Omitted (or "default") means drag order — the same as not having a sort. */
  sortMode?: SortMode;
  /** Omitted or false means ungrouped. */
  grouped?: boolean;
  /**
   * Repo full names whose cluster is collapsed while `grouped` is true.
   * Omitted or empty means every cluster is expanded.
   */
  collapsedRepos?: string[];
}

export interface AutomationRule {
  id: string;
  signal: Signal;
  columnId: string;
}

export interface BoardConfig {
  columns: ColumnDef[];
  rules: AutomationRule[];
  mergedRetentionDays?: number;
  columnWidthPx?: number;
}

export interface PRCard {
  id: string;
  platform: Platform;
  prNumber: number;
  repo: string;
  title: string;
  author: string;
  url: string;
  updatedAt: string;
  isOwnPR: boolean;
  columnId: ColumnId;
  signals: Signal[];
  archived: boolean;
  order: number;
  note?: string;
  ciStatus?: CIStatus;
}

export interface BoardState {
  cards: Record<
    string,
    { column: ColumnId; order: number; archived?: boolean; manual?: boolean; note?: string }
  >;
  enabledRepos?: string[];
}

export const DEFAULT_CONFIG: BoardConfig = {
  columns: [
    { id: "inbox", title: "📥 Inbox" },
    { id: "reviewing", title: "👀 Reviewing" },
    { id: "approved", title: "✅ Approved" },
    { id: "merged", title: "🎉 Merged" },
  ],
  rules: [
    { id: "rule-merged", signal: "merged", columnId: "merged" },
    { id: "rule-approved", signal: "approved", columnId: "approved" },
    { id: "rule-changes-requested", signal: "changes-requested", columnId: "inbox" },
    { id: "rule-review-requested", signal: "review-requested", columnId: "inbox" },
    { id: "rule-pr-open", signal: "pr-open", columnId: "inbox" },
  ],
  mergedRetentionDays: 14,
  columnWidthPx: 300,
};

export const SIGNAL_LABELS: Record<Signal, string> = {
  "pr-open": "PR Open",
  "review-requested": "Review Requested",
  "own-pr": "Own PR",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
  approved: "Approved",
  "changes-requested": "Changes Requested",
};
