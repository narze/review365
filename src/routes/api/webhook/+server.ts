import { json, type RequestEvent } from '@sveltejs/kit';
import { loadBoardState, saveBoardState, setCardColumn } from '$lib/server/board';
import type { ColumnId } from '$lib/types';

const GITHUB_USER = 'narze';

function prKey(repoFull: string, prNumber: number): string {
	return `pr_${repoFull.replace('/', '_')}_${prNumber}`;
}

function determineColumn(event: string, payload: any): { cardId: string; column: ColumnId } | null {
	const repo = payload.repository?.full_name;
	const pr = payload.pull_request;
	if (!repo || !pr) return null;

	const cardId = prKey(repo, pr.number);
	const sender = payload.sender?.login;
	const review = payload.review;
	const action = payload.action;

	// === pull_request events ===
	if (event === 'pull_request' && action === 'opened') {
		return { cardId, column: 'to-review' };
	}
	if (event === 'pull_request' && action === 'closed' && pr.merged) {
		return { cardId, column: 'merged' };
	}
	if (event === 'pull_request' && action === 'closed' && !pr.merged) {
		return { cardId, column: 'to-review' }; // remove from board — will be filtered out
	}

	// === pull_request_review events ===
	if (event === 'pull_request_review' && action === 'submitted') {
		const reviewer = sender;
		const prAuthor = pr.user?.login;

		if (review?.state === 'approved') {
			// narze approved someone else's PR
			if (reviewer === GITHUB_USER && prAuthor !== GITHUB_USER) {
				return { cardId, column: 'approved' };
			}
			// Someone else approved narze's PR
			if (reviewer !== GITHUB_USER && prAuthor === GITHUB_USER) {
				return { cardId, column: 'approved' };
			}
		}

		if (review?.state === 'changes_requested') {
			return { cardId, column: 'revisions' };
		}
	}

	// === pull_request_review_comment events (new commit after changes) ===
	// Note: GitHub doesn't have a direct "new commit after changes-requested" event.
	// We handle this via `pull_request` `synchronize` action (new commits pushed)
	if (event === 'pull_request' && action === 'synchronize') {
		// new commit pushed — move back to to-review
		return { cardId, column: 'to-review' };
	}

	// === review_requested events ===
	if (event === 'pull_request' && action === 'review_requested') {
		const requested = payload.requested_reviewer?.login;
		if (requested === GITHUB_USER) {
			return { cardId, column: 'to-review' };
		}
	}

	return null;
}

async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
	if (!secret || !signature) return false;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
	return signature === `sha256=${hex}`;
}

export async function POST({ request, platform }: RequestEvent) {
	const r2 = platform?.env?.BOARD_STATE;
	const secret = platform?.env?.GITHUB_WEBHOOK_SECRET;

	if (!r2) return json({ error: 'R2 not configured' }, { status: 500 });

	const body = await request.text();
	const event = request.headers.get('x-github-event') || '';
	const signature = request.headers.get('x-hub-signature-256') || '';

	// Verify webhook secret if configured
	if (secret) {
		const valid = await verifySignature(secret, body, signature);
		if (!valid) return json({ error: 'Invalid signature' }, { status: 401 });
	}

	let payload: any;
	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const result = determineColumn(event, payload);
	if (!result) return json({ message: 'no-op', event, action: payload.action });

	const state = await loadBoardState(r2);
	const updated = setCardColumn(state, result.cardId, result.column);
	await saveBoardState(r2, updated);

	return json({ moved: result, event, action: payload.action });
}
