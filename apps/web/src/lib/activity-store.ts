import type { Platform } from '@review365/api/types';
import type { ActivityState } from './activity';

const ACTIVITY_BASE = 'review365:activity';

const EMPTY_ACTIVITY_STATE: ActivityState = { events: [], pendingMoves: {} };

export function activityKey(platform: Platform): string {
	return platform === 'github' ? ACTIVITY_BASE : `${ACTIVITY_BASE}:${platform}`;
}

export function loadActivityState(platform: Platform): ActivityState {
	try {
		const raw = localStorage.getItem(activityKey(platform));
		if (!raw) return { ...EMPTY_ACTIVITY_STATE };
		const parsed = JSON.parse(raw) as Partial<ActivityState>;
		return {
			events: Array.isArray(parsed.events) ? parsed.events : [],
			pendingMoves: parsed.pendingMoves ?? {},
			initialized: parsed.initialized,
			lastSeenAt: parsed.lastSeenAt
		};
	} catch {
		return { ...EMPTY_ACTIVITY_STATE };
	}
}

export function saveActivityState(platform: Platform, state: ActivityState): void {
	try {
		localStorage.setItem(activityKey(platform), JSON.stringify(state));
	} catch {
		// Activity is supplementary local history; the board remains usable if storage is unavailable.
	}
}
