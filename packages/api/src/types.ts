export type ColumnId = string;

export type Platform = "github" | "gitlab";

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

/** Discord notification config. Empty/missing = disabled. */
export interface DiscordConfig {
  /** Full Discord webhook URL (https://discord.com/api/webhooks/...). Stored in localStorage. */
  webhookUrl: string;
  /** Column IDs that should trigger a notification when a card moves into them. */
  notifyColumnIds: string[];
  /** Optional bot display name. Defaults to "Review365". */
  botName?: string;
}

export interface BoardConfig {
  columns: ColumnDef[];
  rules: AutomationRule[];
  mergedRetentionDays?: number;
  columnWidthPx?: number;
  /** Days a card can sit on the board before showing the SLA warning badge. */
  slaWarningDays?: number;
  /** Days before SLA flips to critical (red). Must be > slaWarningDays. */
  slaCriticalDays?: number;
  /** Discord webhook integration. Omit or clear webhookUrl to disable. */
  discord?: DiscordConfig;
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
  /** ISO timestamp when Review365 first saw this PR. Drives SLA/aging badge. */
  firstSeenAt?: string;
}

export interface BoardState {
  cards: Record<
    string,
    {
      column: ColumnId;
      order: number;
      archived?: boolean;
      manual?: boolean;
      note?: string;
      /** ISO timestamp when this card ID first appeared in a fetch result. */
      firstSeenAt?: string;
    }
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
  slaWarningDays: 3,
  slaCriticalDays: 7,
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
