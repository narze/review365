import type { ColumnDef, PRCard, Signal } from "./types";

/**
 * Protocol between the local MCP bridge (`packages/mcp`) and an open review365 tab.
 * The bridge forwards each MCP tool call as a BridgeRequest over a localhost
 * WebSocket; the tab runs it against its own localStorage board and answers with a
 * BridgeResponse. Board state never leaves the browser except as these replies.
 */
export const BRIDGE_DEFAULT_PORT = 47365;

export const NOTE_MAX_LENGTH = 200;

export type BridgeTool = "get_board" | "move_card" | "archive_card" | "unarchive_card" | "set_note";

export interface BridgeRequest {
  id: string;
  tool: BridgeTool;
  args: Record<string, unknown>;
}

export type BridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export interface SnapshotCard {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  signals: Signal[];
  note?: string;
}

export interface BoardSnapshot {
  columns: { id: string; title: string; cards: SnapshotCard[] }[];
  archived?: SnapshotCard[];
}

export interface BridgeHandlers {
  snapshot(opts?: { includeArchived?: boolean }): BoardSnapshot;
  /** `beforeCardId` null means the end of the column. */
  moveCard(cardId: string, columnId: string, beforeCardId: string | null): Promise<void>;
  archiveCard(cardId: string): Promise<void>;
  unarchiveCard(cardId: string): Promise<void>;
  setNote(cardId: string, note: string): Promise<void>;
}

function toSnapshotCard(card: PRCard): SnapshotCard {
  return {
    id: card.id,
    repo: card.repo,
    number: card.prNumber,
    title: card.title,
    author: card.author,
    url: card.url,
    signals: card.signals,
    ...(card.note ? { note: card.note } : {}),
  };
}

/** Cards are listed in drag order; a column's display sort mode does not apply. */
export function buildBoardSnapshot(
  columns: ColumnDef[],
  cards: PRCard[],
  opts: { includeArchived?: boolean } = {},
): BoardSnapshot {
  const sorted = [...cards].sort((a, b) => a.order - b.order);
  const snapshot: BoardSnapshot = {
    columns: columns.map((col) => ({
      id: col.id,
      title: col.title,
      cards: sorted.filter((c) => c.columnId === col.id && !c.archived).map(toSnapshotCard),
    })),
  };
  if (opts.includeArchived) {
    snapshot.archived = sorted.filter((c) => c.archived).map(toSnapshotCard);
  }
  return snapshot;
}

class BridgeError extends Error {}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value === "") {
    throw new BridgeError(`Argument ${name} must be a non-empty string`);
  }
  return value;
}

interface Located {
  card: SnapshotCard;
  columnId: string | null;
}

function locate(snapshot: BoardSnapshot, cardId: string): Located {
  for (const col of snapshot.columns) {
    const card = col.cards.find((c) => c.id === cardId);
    if (card) return { card, columnId: col.id };
  }
  const archived = snapshot.archived?.find((c) => c.id === cardId);
  if (archived) return { card: archived, columnId: null };
  throw new BridgeError(`Unknown card: ${cardId}`);
}

async function run(req: BridgeRequest, handlers: BridgeHandlers): Promise<unknown> {
  const args = req.args ?? {};
  switch (req.tool) {
    case "get_board":
      return handlers.snapshot({ includeArchived: args.include_archived === true });

    case "move_card": {
      const cardId = stringArg(args, "card_id");
      const columnId = stringArg(args, "column_id");
      const before = args.before_card_id == null ? null : stringArg(args, "before_card_id");
      const snapshot = handlers.snapshot({ includeArchived: true });
      const { columnId: from } = locate(snapshot, cardId);
      if (from === null) throw new BridgeError(`Card ${cardId} is archived; unarchive it first`);
      const target = snapshot.columns.find((c) => c.id === columnId);
      if (!target) throw new BridgeError(`Unknown column: ${columnId}`);
      if (before !== null && (before === cardId || !target.cards.some((c) => c.id === before))) {
        throw new BridgeError(`before_card_id ${before} is not another card in column ${columnId}`);
      }
      await handlers.moveCard(cardId, columnId, before);
      return locate(handlers.snapshot(), cardId);
    }

    case "archive_card": {
      const cardId = stringArg(args, "card_id");
      locate(handlers.snapshot({ includeArchived: true }), cardId);
      await handlers.archiveCard(cardId);
      return { archived: cardId };
    }

    case "unarchive_card": {
      const cardId = stringArg(args, "card_id");
      locate(handlers.snapshot({ includeArchived: true }), cardId);
      await handlers.unarchiveCard(cardId);
      return locate(handlers.snapshot(), cardId);
    }

    case "set_note": {
      const cardId = stringArg(args, "card_id");
      const note = args.note;
      if (typeof note !== "string") throw new BridgeError("Argument note must be a string");
      if (note.length > NOTE_MAX_LENGTH) {
        throw new BridgeError(`Note is longer than ${NOTE_MAX_LENGTH} characters`);
      }
      locate(handlers.snapshot({ includeArchived: true }), cardId);
      await handlers.setNote(cardId, note);
      return locate(handlers.snapshot({ includeArchived: true }), cardId);
    }

    default:
      throw new BridgeError(`Unknown tool: ${String(req.tool)}`);
  }
}

/** Runs one request against the tab's board. Never throws: failures become error responses. */
export async function dispatchBridgeRequest(
  req: BridgeRequest,
  handlers: BridgeHandlers,
): Promise<BridgeResponse> {
  try {
    return { id: req.id, ok: true, result: await run(req, handlers) };
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
