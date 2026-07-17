import { describe, expect, it } from 'bun:test';
import {
	appendActivity,
	classifyNoteChange,
	flushPendingMoves,
	filterActivities,
	finalizePendingMove,
	queuePendingMove,
	type ActivityState,
	type ActivityEvent,
	type PendingMove
} from './activity';

const card = {
	cardId: 'pr_acme_review365_14',
	repo: 'acme/review365',
	number: 14,
	title: 'Add Activity view',
	url: 'https://github.com/acme/review365/pull/14',
	platform: 'github' as const
};

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
	return {
		id: 'event-1',
		createdAt: '2026-07-14T10:00:00.000Z',
		type: 'moved',
		source: 'manual',
		card,
		fromColumn: 'inbox',
		toColumn: 'review',
		...overrides
	};
}

describe('activity events', () => {
	it('keeps newest events first and retains the latest 500', () => {
		const existing = Array.from({ length: 500 }, (_, index) =>
			event({
				id: `event-${index}`,
				createdAt: new Date(1000 + index).toISOString()
			})
		);

		const activities = appendActivity(existing, event({ id: 'newest', createdAt: new Date(9000).toISOString() }));

		expect(activities).toHaveLength(500);
		expect(activities[0].id).toBe('newest');
		expect(activities.some((activity) => activity.id === 'event-0')).toBe(false);
	});

	it('classifies note changes without retaining note text', () => {
		expect(classifyNoteChange(undefined, 'Investigate this')).toBe('note-added');
		expect(classifyNoteChange('Old note', 'New note')).toBe('note-updated');
		expect(classifyNoteChange('Old note', '')).toBe('note-removed');
		expect(classifyNoteChange('Same', 'Same')).toBeNull();
	});

	it('filters by card metadata and action type', () => {
		const archived = event({ id: 'archive', type: 'archived', card: { ...card, number: 8, title: 'Archive stale card' } });
		const activities = [event(), archived];

		expect(filterActivities(activities, 'review365 #14', 'all')).toEqual([activities[0]]);
		expect(filterActivities(activities, '', 'archived')).toEqual([archived]);
	});

	it('collapses a pending move into one event and ignores a return to its origin', () => {
		const pending: PendingMove = {
			...card,
			source: 'manual',
			fromColumn: 'inbox',
			toColumn: 'approved',
			dueAt: 9000
		};

		expect(finalizePendingMove(pending, 9000)?.fromColumn).toBe('inbox');
		expect(finalizePendingMove(pending, 9000)?.toColumn).toBe('approved');
		expect(finalizePendingMove({ ...pending, toColumn: 'inbox' }, 9000)).toBeNull();
	});

	it('persists a pending move state that can be resumed and flushed after its deadline', () => {
		const initial: ActivityState = { events: [], pendingMoves: {} };
		const queued = queuePendingMove(initial, {
			...card,
			source: 'manual',
			fromColumn: 'inbox',
			toColumn: 'review',
			dueAt: 5000
		});
		const updated = queuePendingMove(queued, { ...queued.pendingMoves[card.cardId], toColumn: 'approved', dueAt: 8000 });

		const flushed = flushPendingMoves(updated, 8000);
		expect(flushed.pendingMoves).toEqual({});
		expect(flushed.events[0]).toMatchObject({ type: 'moved', fromColumn: 'inbox', toColumn: 'approved' });
	});
});
