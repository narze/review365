import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BridgeRequest } from "@review365/api/bridge";
import { handleMcp, handleReply, handleStream } from "./bridge-handlers";
import { MemoryPubSub } from "./relay";

const TOKEN = "t".repeat(43);
const ORIGIN = "https://review365.test";
const auth = { Authorization: `Bearer ${TOKEN}` };

/**
 * A fake tab that reads the SSE command stream and posts each answer to the reply
 * endpoint, the same way the real tab does.
 */
async function connectTab(pubsub: MemoryPubSub, answer: (req: BridgeRequest) => unknown) {
  const res = await handleStream(
    new Request(`${ORIGIN}/api/bridge/stream`, { headers: auth }),
    pubsub,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event.split("\n").find((l) => l.startsWith("data: "));
        if (!data) continue;
        const req = JSON.parse(data.slice(6)) as BridgeRequest;
        await handleReply(
          new Request(`${ORIGIN}/api/bridge/reply`, {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ id: req.id, ok: true, result: answer(req) }),
          }),
          pubsub,
        );
      }
    }
  })();
  // Let the stream subscribe before callers publish.
  await Bun.sleep(10);
  return () => reader.cancel();
}

async function mcpClient(pubsub: MemoryPubSub, token = TOKEN) {
  const client = new Client({ name: "test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init) => handleMcp(new Request(input, init), pubsub),
  });
  await client.connect(transport);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { text: string }[]).map((c) => c.text).join("");
}

describe("handleMcp", () => {
  test("rejects requests without a valid bearer token", async () => {
    const res = await handleMcp(
      new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" }),
      new MemoryPubSub(),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  test("lists the board tools", async () => {
    const client = await mcpClient(new MemoryPubSub());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "archive_card",
      "get_board",
      "move_card",
      "set_note",
      "unarchive_card",
    ]);
  });

  test("runs a tool call in the paired tab", async () => {
    const pubsub = new MemoryPubSub();
    const seen: BridgeRequest[] = [];
    const disconnect = await connectTab(pubsub, (req) => {
      seen.push(req);
      return { moved: req.args.card_id };
    });
    const client = await mcpClient(pubsub);
    const result = await client.callTool({
      name: "move_card",
      arguments: { card_id: "a", column_id: "reviewing" },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ moved: "a" });
    expect(seen.map((r) => [r.tool, r.args])).toEqual([
      ["move_card", { card_id: "a", column_id: "reviewing" }],
    ]);
    await disconnect();
  });

  test("returns a tool error when no tab is paired with the token", async () => {
    const pubsub = new MemoryPubSub();
    const disconnect = await connectTab(pubsub, () => "other tab");
    const client = await mcpClient(pubsub, "x".repeat(43));
    const result = await client.callTool({ name: "get_board", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("No review365 tab is connected");
    await disconnect();
  });
});

describe("handleStream", () => {
  test("rejects requests without a valid bearer token", async () => {
    const res = await handleStream(new Request(`${ORIGIN}/api/bridge/stream`), new MemoryPubSub());
    expect(res.status).toBe(401);
  });

  test("ends the stream and unsubscribes after maxMs so the tab reconnects", async () => {
    const pubsub = new MemoryPubSub();
    const res = await handleStream(
      new Request(`${ORIGIN}/api/bridge/stream`, { headers: auth }),
      pubsub,
      { maxMs: 30, heartbeatMs: 10 },
    );
    const body = await res.text();
    expect(body).toContain(": ping");
    expect(pubsub.subscriberCount()).toBe(0);
  });

  test("unsubscribes when the tab goes away", async () => {
    const pubsub = new MemoryPubSub();
    const abort = new AbortController();
    const res = await handleStream(
      new Request(`${ORIGIN}/api/bridge/stream`, { headers: auth, signal: abort.signal }),
      pubsub,
    );
    expect(pubsub.subscriberCount()).toBe(1);
    await res.body!.cancel();
    expect(pubsub.subscriberCount()).toBe(0);
  });
});

describe("handleReply", () => {
  test("rejects missing tokens and malformed bodies", async () => {
    const pubsub = new MemoryPubSub();
    const post = (headers: Record<string, string>, body: string) =>
      handleReply(
        new Request(`${ORIGIN}/api/bridge/reply`, { method: "POST", headers, body }),
        pubsub,
      );
    expect((await post({}, '{"id":"1","ok":true}')).status).toBe(401);
    expect((await post(auth, "not json")).status).toBe(400);
    expect((await post(auth, '{"ok":true}')).status).toBe(400);
  });
});
