// Lets an AI agent read and edit this board through the MCP endpoint (/api/mcp).
// The board stays in localStorage: the server only relays each tool call to this
// tab over an SSE stream, and the tab posts the result back. A random pairing
// token, made here and given to the agent, links the two. Opt-in.
import { dispatchBridgeRequest, type BridgeHandlers, type BridgeRequest } from '@review365/api/bridge';

const SETTINGS_KEY = 'review365:mcp-bridge';
// Tabs share localStorage and the token, so only the tab holding this lock listens;
// otherwise every open tab would run each command.
const LOCK_NAME = 'review365:mcp-bridge';
const MAX_RETRY_MS = 10_000;

export interface BridgeSettings {
	enabled: boolean;
	token: string | null;
}

export type BridgeStatus = 'off' | 'standby' | 'connecting' | 'connected';

export const mcpBridge = $state<{
	enabled: boolean;
	token: string | null;
	status: BridgeStatus;
	error: string | null;
}>({ enabled: false, token: null, status: 'off', error: null });

export function loadBridgeSettings(): BridgeSettings {
	try {
		const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<BridgeSettings>;
		return {
			enabled: raw.enabled === true,
			token: typeof raw.token === 'string' && raw.token ? raw.token : null
		};
	} catch {
		return { enabled: false, token: null };
	}
}

function saveBridgeSettings(settings: BridgeSettings) {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

let activeHandlers: BridgeHandlers | null = null;
let run: AbortController | null = null;

function sleep(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

async function answer(data: string, token: string, handlers: BridgeHandlers) {
	let req: BridgeRequest;
	try {
		req = JSON.parse(data) as BridgeRequest;
	} catch {
		return;
	}
	const res = await dispatchBridgeRequest(req, handlers);
	await fetch('/api/bridge/reply', {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(res)
	}).catch(() => {
		// the agent's call times out and reports it
	});
}

async function readEvents(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += decoder.decode(value, { stream: true });
		let end: number;
		while ((end = buffer.indexOf('\n\n')) >= 0) {
			const event = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			for (const line of event.split('\n')) {
				if (line.startsWith('data: ')) onData(line.slice(6));
			}
		}
	}
}

async function listen(token: string, handlers: BridgeHandlers, signal: AbortSignal) {
	let retryMs = 1000;
	while (!signal.aborted) {
		mcpBridge.status = 'connecting';
		try {
			const res = await fetch('/api/bridge/stream', {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
				signal
			});
			if (!res.ok || !res.body) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? `MCP relay answered ${res.status}`);
			}
			mcpBridge.status = 'connected';
			mcpBridge.error = null;
			retryMs = 1000;
			await readEvents(res.body, (data) => void answer(data, token, handlers));
			// The server ends each stream before its time limit; reconnect at once.
			continue;
		} catch (err) {
			if (signal.aborted) return;
			if (err instanceof Error && !(err instanceof TypeError)) mcpBridge.error = err.message;
		}
		mcpBridge.status = 'connecting';
		await sleep(retryMs, signal);
		retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
	}
}

/** Stops any running connection and starts one that matches the saved settings. */
function restart() {
	// Aborting stops this tab from running commands at once. The browser may keep the
	// old connection open a while longer, so a call with a replaced token can wait for
	// its timeout instead of failing fast, but it never runs.
	run?.abort();
	run = null;
	const settings = loadBridgeSettings();
	mcpBridge.enabled = settings.enabled;
	mcpBridge.token = settings.token;
	mcpBridge.error = null;
	const handlers = activeHandlers;
	const token = settings.token;
	if (!handlers || !settings.enabled || !token) {
		mcpBridge.status = 'off';
		return;
	}
	const controller = new AbortController();
	run = controller;
	const { signal } = controller;
	mcpBridge.status = 'standby';
	navigator.locks
		.request(LOCK_NAME, { signal }, () => listen(token, handlers, signal))
		.catch(() => {
			// aborted while waiting for or holding the lock
		});
}

export function setBridgeEnabled(enabled: boolean) {
	const settings = loadBridgeSettings();
	saveBridgeSettings({ enabled, token: settings.token ?? generateToken() });
	restart();
}

/** Makes a new pairing token. Agents set up with the old one lose access. */
export function rotateBridgeToken() {
	saveBridgeSettings({ ...loadBridgeSettings(), token: generateToken() });
	restart();
}

/** Called once by the board page; returns a cleanup function. */
export function startMcpBridge(handlers: BridgeHandlers): () => void {
	activeHandlers = handlers;
	// Another tab may turn access off or change the token.
	const onStorage = (event: StorageEvent) => {
		if (event.key === SETTINGS_KEY) restart();
	};
	window.addEventListener('storage', onStorage);
	restart();
	return () => {
		window.removeEventListener('storage', onStorage);
		activeHandlers = null;
		restart();
	};
}
