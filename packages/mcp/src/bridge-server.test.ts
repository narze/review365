import { afterEach, describe, expect, it } from "bun:test";
import WebSocket from "ws";
import type { BridgeRequest, BridgeResponse } from "@review365/api/bridge";
import { startBridgeServer, type BridgeServer } from "./bridge-server";

const ORIGIN = "http://localhost:5173";

let server: BridgeServer | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  await server?.close();
  server = undefined;
});

async function start(timeoutMs = 1000) {
  server = await startBridgeServer({ port: 0, allowedOrigins: [ORIGIN], timeoutMs });
  return server;
}

/** A fake tab: answers every request with `reply`. */
function connectTab(
  port: number,
  reply: (req: BridgeRequest) => BridgeResponse | null,
  origin = ORIGIN,
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  sockets.push(ws);
  ws.on("message", (data) => {
    const res = reply(JSON.parse(String(data)) as BridgeRequest);
    if (res) ws.send(JSON.stringify(res));
  });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await Bun.sleep(10);
}

describe("startBridgeServer", () => {
  it("fails a call when no tab is connected", async () => {
    const s = await start();
    expect(s.isConnected()).toBe(false);
    await expect(s.call("get_board", {})).rejects.toThrow(/No review365 tab is connected/);
  });

  it("forwards a call to the tab and returns its result", async () => {
    const s = await start();
    await connectTab(s.port, (req) => ({ id: req.id, ok: true, result: { echo: req } }));
    await waitFor(() => s.isConnected());
    const result = (await s.call("move_card", { card_id: "a", column_id: "b" })) as {
      echo: BridgeRequest;
    };
    expect(result.echo.tool).toBe("move_card");
    expect(result.echo.args).toEqual({ card_id: "a", column_id: "b" });
  });

  it("rejects with the tab's error message", async () => {
    const s = await start();
    await connectTab(s.port, (req) => ({ id: req.id, ok: false, error: "Unknown card: a" }));
    await waitFor(() => s.isConnected());
    await expect(s.call("archive_card", { card_id: "a" })).rejects.toThrow("Unknown card: a");
  });

  it("times out when the tab never answers", async () => {
    const s = await start(50);
    await connectTab(s.port, () => null);
    await waitFor(() => s.isConnected());
    await expect(s.call("get_board", {})).rejects.toThrow(/did not answer/);
  });

  it("refuses connections from origins that are not allowed", async () => {
    const s = await start();
    await expect(connectTab(s.port, () => null, "https://evil.example")).rejects.toThrow();
    expect(s.isConnected()).toBe(false);
  });

  it("uses the newest tab and falls back to an older one when it closes", async () => {
    const s = await start();
    await connectTab(s.port, (req) => ({ id: req.id, ok: true, result: "old" }));
    const newer = await connectTab(s.port, (req) => ({ id: req.id, ok: true, result: "new" }));
    await waitFor(() => s.isConnected());
    expect(await s.call("get_board", {})).toBe("new");
    newer.close();
    await waitFor(() => s.tabCount() === 1);
    expect(await s.call("get_board", {})).toBe("old");
  });

  it("fails pending calls when the tab disconnects", async () => {
    const s = await start();
    const tab = await connectTab(s.port, () => null);
    await waitFor(() => s.isConnected());
    const pending = s.call("get_board", {});
    tab.close();
    await expect(pending).rejects.toThrow(/disconnected/);
  });
});
