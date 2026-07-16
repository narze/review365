import type { Platform } from '@review365/api/types';

export const ACTIVITY_LIMIT = 500;

export type ActivityType =
	| 'discovered'
	| 'moved'
	| 'archived'
	| 'unarchived'
	| 'note-added'
	| 'note-updated'
	| 'note-removed';

export type ActivitySource = 'manual' | 'automation';

export interface ActivityCard {
	cardId: string;
	repo: string;
	number: number;
	title: string;
	url: string;
	platform: Platform;
}

export interface ActivityEvent {
	id: string;
	createdAt: string;
	type: ActivityType;
	source: ActivitySource;
	card: ActivityCard;
	fromColumn?: string;
	toColumn?: string;
}

export interface PendingMove extends ActivityCard {
	source: ActivitySource;
	fromColumn: string;
	toColumn: string;
	dueAt: number;
}

export interface ActivityState {
	events: ActivityEvent[];
	pendingMoves: Record<string, PendingMove>;
	initialized?: boolean;
	lastSeenAt?: string;
}

export function appendActivity(
	activities: ActivityEvent[],
	activity: ActivityEvent
): ActivityEvent[] {
	return [...activities, activity]
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, ACTIVITY_LIMIT);
}

export function classifyNoteChange(
	previous: string | undefined,
	next: string
): Extract<ActivityType, `note-${string}`> | null {
	const before = previous?.trim() ?? '';
	const after = next.trim();
	if (before === after) return null;
	if (!before) return 'note-added';
	if (!after) return 'note-removed';
	return 'note-updated';
}

export function filterActivities(
	activities: ActivityEvent[],
	query: string,
	type: ActivityType | 'all'
): ActivityEvent[] {
	const normalizedQuery = query.trim().toLowerCase();
	return activities.filter((activity) => {
		if (type !== 'all' && activity.type !== type) return false;
		if (!normalizedQuery) return true;
		const numberPrefix = activity.card.platform === 'gitlab' ? '!' : '#';
		return `${activity.card.repo} ${numberPrefix}${activity.card.number} ${activity.card.title}`
			.toLowerCase()
			.includes(normalizedQuery);
	});
}

export function finalizePendingMove(pending: PendingMove, now = Date.now()): ActivityEvent | null {
	if (pending.fromColumn === pending.toColumn) return null;
	return {
		id: `${pending.cardId}:${now}`,
		createdAt: new Date(now).toISOString(),
		type: 'moved',
		source: pending.source,
		card: {
			cardId: pending.cardId,
			repo: pending.repo,
			number: pending.number,
			title: pending.title,
			url: pending.url,
			platform: pending.platform
		},
		fromColumn: pending.fromColumn,
		toColumn: pending.toColumn
	};
}

export function queuePendingMove(state: ActivityState, pending: PendingMove): ActivityState {
	const existing = state.pendingMoves[pending.cardId];
	return {
		...state,
		pendingMoves: {
			...state.pendingMoves,
			[pending.cardId]: existing
				? { ...pending, fromColumn: existing.fromColumn, source: existing.source }
				: pending
		}
	};
}

export function flushPendingMoves(state: ActivityState, now = Date.now()): ActivityState {
	let events = state.events;
	const pendingMoves: Record<string, PendingMove> = {};
	for (const [cardId, pending] of Object.entries(state.pendingMoves)) {
		if (pending.dueAt > now) {
			pendingMoves[cardId] = pending;
			continue;
		}
		const activity = finalizePendingMove(pending, now);
		if (activity) events = appendActivity(events, activity);
	}
	return { ...state, events, pendingMoves };
}
