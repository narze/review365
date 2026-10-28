import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { BridgeTool } from "@review365/api/bridge";
import { createMcpServer } from "./mcp-server";

async function connect(
  call: (tool: BridgeTool, args: Record<string, unknown>) => Promise<unknown>,
) {
  const server = createMcpServer(call);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  return content.map((c) => c.text).join("");
}

describe("createMcpServer", () => {
  it("lists the board tools", async () => {
    const client = await connect(async () => null);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "archive_card",
      "get_board",
      "move_card",
      "set_note",
      "unarchive_card",
    ]);
  });

  it("forwards tool calls to the bridge and returns JSON text", async () => {
    const calls: [BridgeTool, Record<string, unknown>][] = [];
    const client = await connect(async (tool, args) => {
      calls.push([tool, args]);
      return { ok: tool };
    });
    const result = await client.callTool({
      name: "move_card",
      arguments: { card_id: "a", column_id: "reviewing", before_card_id: "b" },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ ok: "move_card" });
    expect(calls).toEqual([
      ["move_card", { card_id: "a", column_id: "reviewing", before_card_id: "b" }],
    ]);
  });

  it("reports bridge failures as tool errors", async () => {
    const client = await connect(async () => {
      throw new Error("No review365 tab is connected");
    });
    const result = await client.callTool({ name: "get_board", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("No review365 tab is connected");
  });
});
