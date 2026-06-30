// === Review365 Types ===

export const COLUMNS = [
	{ id: 'to-review', title: '📥 To Review' },
	{ id: 'in-review', title: '👀 In Review' },
	{ id: 'revisions', title: '🔄 Revisions' },
	{ id: 'awaiting-approval', title: '⏳ Awaiting Approval' },
	{ id: 'approved', title: '✅ Approved' },
	{ id: 'merged', title: '🎉 Merged' }
] as const;

export type ColumnId = (typeof COLUMNS)[number]['id'];

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
}

export interface BoardState {
	cards: Record<string, { column: ColumnId; order: number }>;
}
