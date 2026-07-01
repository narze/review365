export type ColumnId = string;

export type Signal =
  | "pr-open"
  | "review-requested"
  | "own-pr"
  | "draft"
  | "merged"
  | "closed"
  | "approved"
  | "changes-requested";

export interface ColumnDef {
  id: string;
  title: string;
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
}

export interface PRCard {
  id: string;
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
}

export interface BoardState {
  cards: Record<string, { column: ColumnId; order: number; archived?: boolean; manual?: boolean }>;
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
