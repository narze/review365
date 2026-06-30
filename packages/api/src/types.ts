export type ColumnId = string;

export type Signal =
	| 'review-requested'
	| 'own-pr'
	| 'draft'
	| 'merged'
	| 'closed'
	| 'approved'
	| 'changes-requested';

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
}

export interface BoardState {
	cards: Record<string, { column: ColumnId; order: number }>;
	enabledRepos?: string[];
}

export const DEFAULT_CONFIG: BoardConfig = {
	columns: [
		{ id: 'inbox', title: '📥 Inbox' },
		{ id: 'reviewing', title: '👀 Reviewing' },
		{ id: 'approved', title: '✅ Approved' },
		{ id: 'merged', title: '🎉 Merged' }
	],
	rules: [
		{ id: 'rule-merged', signal: 'merged', columnId: 'merged' },
		{ id: 'rule-approved', signal: 'approved', columnId: 'approved' },
		{ id: 'rule-review-requested', signal: 'review-requested', columnId: 'inbox' }
	]
};

export const SIGNAL_LABELS: Record<Signal, string> = {
	'review-requested': 'Review Requested',
	'own-pr': 'Own PR',
	'draft': 'Draft',
	'merged': 'Merged',
	'closed': 'Closed',
	'approved': 'Approved',
	'changes-requested': 'Changes Requested'
};
