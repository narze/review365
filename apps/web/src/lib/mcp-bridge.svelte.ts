// Connects this tab to the local review365 MCP server (packages/mcp) so an agent can
// read and edit the board. The board stays in localStorage: the MCP server only
// forwards tool calls over a localhost WebSocket and this tab runs them. Opt-in,
// because connecting to localhost from a public origin triggers a browser prompt.
import {
	BRIDGE_DEFAULT_PORT,
	dispatchBridgeRequest,
	type BridgeHandlers,
	type BridgeRequest
} from '@review365/api/bridge';

const SETTINGS_KEY = 'review365:mcp-bridge';
const MAX_RETRY_MS = 5000;

export interface BridgeSettings {
	enabled: boolean;
	port: number;
}

export type BridgeStatus = 'off' | 'connecting' | 'connected';

export const mcpBridge = $state<{ enabled: boolean; status: BridgeStatus }>({
	enabled: false,
	status: 'off'
});

export function loadBridgeSettings(): BridgeSettings {
	try {
		const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<BridgeSettings>;
		return {
			enabled: raw.enabled === true,
			port: Number.isInteger(raw.port) ? (raw.port as number) : BRIDGE_DEFAULT_PORT
		};
	} catch {
		return { enabled: false, port: BRIDGE_DEFAULT_PORT };
	}
}

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryMs = 1000;
let activeHandlers: BridgeHandlers | null = null;

function disconnect() {
	clearTimeout(retryTimer);
	const s = socket;
	socket = null;
	s?.close();
	mcpBridge.status = 'off';
}

function connect() {
	if (!activeHandlers || socket) return;
	const handlers = activeHandlers;
	const { port } = loadBridgeSettings();
	mcpBridge.status = 'connecting';
	const ws = new WebSocket(`ws://127.0.0.1:${port}`);
	socket = ws;

	ws.onopen = () => {
		retryMs = 1000;
		mcpBridge.status = 'connected';
	};
	ws.onmessage = async (event) => {
		let req: BridgeRequest;
		try {
			req = JSON.parse(String(event.data)) as BridgeRequest;
		} catch {
			return;
		}
		const res = await dispatchBridgeRequest(req, handlers);
		if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(res));
	};
	ws.onclose = () => {
		if (socket !== ws) return; // closed on purpose by disconnect()
		socket = null;
		mcpBridge.status = 'connecting';
		// The MCP server starts and stops with the agent, so keep retrying quietly.
		retryTimer = setTimeout(connect, retryMs);
		retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
	};
}

export function setBridgeEnabled(enabled: boolean) {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadBridgeSettings(), enabled }));
	mcpBridge.enabled = enabled;
	disconnect();
	if (enabled) connect();
}

/** Called once by the board page; returns a cleanup function. */
export function startMcpBridge(handlers: BridgeHandlers): () => void {
	activeHandlers = handlers;
	mcpBridge.enabled = loadBridgeSettings().enabled;
	if (mcpBridge.enabled) connect();
	return () => {
		activeHandlers = null;
		disconnect();
	};
}
