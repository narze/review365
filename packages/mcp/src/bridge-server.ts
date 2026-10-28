import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { BridgeRequest, BridgeResponse, BridgeTool } from "@review365/api/bridge";

export interface BridgeServerOptions {
  port: number;
  host?: string;
  /**
   * Browsers always send the page's real Origin on a WebSocket handshake, so this is
   * what stops an unrelated website from posing as the review365 tab.
   */
  allowedOrigins: string[];
  timeoutMs?: number;
}

export interface BridgeServer {
  port: number;
  isConnected(): boolean;
  tabCount(): number;
  call(tool: BridgeTool, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

interface Pending {
  tab: WebSocket;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export async function startBridgeServer(opts: BridgeServerOptions): Promise<BridgeServer> {
  const allowed = new Set(opts.allowedOrigins);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  // Newest last: the most recently opened tab answers calls.
  const tabs: WebSocket[] = [];
  const pending = new Map<string, Pending>();

  const wss = new WebSocketServer({
    port: opts.port,
    host: opts.host ?? "127.0.0.1",
    verifyClient: ({ origin }: { origin?: string }) => !!origin && allowed.has(origin),
  });

  await new Promise<void>((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });

  wss.on("connection", (tab) => {
    tabs.push(tab);
    tab.on("message", (data) => {
      let res: BridgeResponse;
      try {
        res = JSON.parse(String(data)) as BridgeResponse;
      } catch {
        return;
      }
      const entry = pending.get(res.id);
      if (!entry) return;
      pending.delete(res.id);
      clearTimeout(entry.timer);
      if (res.ok) entry.resolve(res.result);
      else entry.reject(new Error(res.error));
    });
    tab.on("close", () => {
      tabs.splice(tabs.indexOf(tab), 1);
      for (const [id, entry] of pending) {
        if (entry.tab !== tab) continue;
        pending.delete(id);
        clearTimeout(entry.timer);
        entry.reject(new Error("The review365 tab disconnected before it answered"));
      }
    });
  });

  const address = wss.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    port,
    isConnected: () => tabs.length > 0,
    tabCount: () => tabs.length,
    call(tool, args) {
      const tab = tabs.at(-1);
      if (!tab) {
        return Promise.reject(
          new Error(
            "No review365 tab is connected. Open review365, turn on the MCP bridge in Settings, and try again.",
          ),
        );
      }
      const req: BridgeRequest = { id: randomUUID(), tool, args };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(req.id);
          reject(new Error(`The review365 tab did not answer within ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(req.id, { tab, resolve, reject, timer });
        tab.send(JSON.stringify(req));
      });
    },
    close() {
      for (const tab of tabs) tab.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}
