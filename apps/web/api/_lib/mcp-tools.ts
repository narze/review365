import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeTool } from "@review365/api/bridge";

export type BridgeCall = (tool: BridgeTool, args: Record<string, unknown>) => Promise<unknown>;

const cardId = z.string().min(1).describe("Card id from get_board, e.g. pr_owner_repo_123");

export function createMcpServer(call: BridgeCall): McpServer {
  const server = new McpServer({ name: "review365", version: "0.1.0" });

  async function forward(tool: BridgeTool, args: Record<string, unknown>) {
    try {
      const result = await call(tool, args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  }

  server.registerTool(
    "get_board",
    {
      description:
        "Read the review365 kanban board open in the browser: each column with its PR/MR cards in drag order.",
      inputSchema: {
        include_archived: z.boolean().optional().describe("Also list archived cards"),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => forward("get_board", args),
  );

  server.registerTool(
    "move_card",
    {
      description:
        "Move a card to a column. It goes to the end of the column unless before_card_id is given.",
      inputSchema: {
        card_id: cardId,
        column_id: z.string().min(1).describe("Target column id from get_board"),
        before_card_id: z
          .string()
          .min(1)
          .optional()
          .describe("Put the card just above this card in the target column"),
      },
    },
    (args) => forward("move_card", args),
  );

  server.registerTool(
    "archive_card",
    {
      description: "Archive a card so it is hidden from the board.",
      inputSchema: { card_id: cardId },
    },
    (args) => forward("archive_card", args),
  );

  server.registerTool(
    "unarchive_card",
    {
      description: "Bring an archived card back onto the board.",
      inputSchema: { card_id: cardId },
    },
    (args) => forward("unarchive_card", args),
  );

  server.registerTool(
    "set_note",
    {
      description: "Set the short note shown on a card. An empty string removes the note.",
      // The tab enforces the 200-character limit (NOTE_MAX_LENGTH) and reports it as an error.
      inputSchema: { card_id: cardId, note: z.string().describe("At most 200 characters") },
    },
    (args) => forward("set_note", args),
  );

  return server;
}
