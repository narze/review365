import { describe, expect, it } from "bun:test";
import { buildBoardSnapshot, dispatchBridgeRequest, type BridgeHandlers } from "./bridge";
import type { ColumnDef, PRCard } from "./types";

const columns: ColumnDef[] = [
  { id: "inbox", title: "📥 Inbox" },
  { id: "reviewing", title: "👀 Reviewing" },
];

function card(id: string, columnId: string, order: number, extra: Partial<PRCard> = {}): PRCard {
  return {
    id,
    platform: "github",
    prNumber: order,
    repo: "test/repo",
    title: `PR ${id}`,
    author: "someone",
    url: `https://github.com/test/repo/pull/${order}`,
    updatedAt: "2026-10-28T00:00:00.000Z",
    isOwnPR: false,
    columnId,
    signals: ["pr-open"],
    archived: false,
    order,
    ...extra,
  };
}

function setup(cards: PRCard[]) {
  const calls: unknown[][] = [];
  const handlers: BridgeHandlers = {
    snapshot: (opts) => buildBoardSnapshot(columns, cards, opts),
    moveCard: async (...args) => void calls.push(["moveCard", ...args]),
    archiveCard: async (...args) => void calls.push(["archiveCard", ...args]),
    unarchiveCard: async (...args) => void calls.push(["unarchiveCard", ...args]),
    setNote: async (...args) => void calls.push(["setNote", ...args]),
  };
  return { handlers, calls };
}

describe("buildBoardSnapshot", () => {
  it("nests cards under their column in order and hides archived cards", () => {
    const snap = buildBoardSnapshot(columns, [
      card("b", "inbox", 2),
      card("a", "inbox", 1),
      card("c", "reviewing", 3),
      card("x", "inbox", 4, { archived: true }),
    ]);
    expect(snap.columns.map((c) => [c.id, c.cards.map((k) => k.id)])).toEqual([
      ["inbox", ["a", "b"]],
      ["reviewing", ["c"]],
    ]);
    expect(snap.archived).toBeUndefined();
  });

  it("lists archived cards separately when asked", () => {
    const snap = buildBoardSnapshot(columns, [card("x", "inbox", 4, { archived: true })], {
      includeArchived: true,
    });
    expect(snap.archived?.map((c) => c.id)).toEqual(["x"]);
  });

  it("keeps only the fields an agent needs", () => {
    const snap = buildBoardSnapshot(columns, [card("a", "inbox", 1, { note: "hi" })]);
    expect(snap.columns[0]?.cards[0]).toEqual({
      id: "a",
      repo: "test/repo",
      number: 1,
      title: "PR a",
      author: "someone",
      url: "https://github.com/test/repo/pull/1",
      signals: ["pr-open"],
      note: "hi",
    });
  });
});

describe("dispatchBridgeRequest", () => {
  it("get_board returns the snapshot", async () => {
    const { handlers } = setup([card("a", "inbox", 1)]);
    const res = await dispatchBridgeRequest({ id: "1", tool: "get_board", args: {} }, handlers);
    expect(res.ok).toBe(true);
    expect(res.id).toBe("1");
    if (res.ok) expect(res.result).toEqual(handlers.snapshot());
  });

  it("move_card moves to the end of a column when no before_card_id is given", async () => {
    const { handlers, calls } = setup([card("a", "inbox", 1)]);
    const res = await dispatchBridgeRequest(
      { id: "1", tool: "move_card", args: { card_id: "a", column_id: "reviewing" } },
      handlers,
    );
    expect(res.ok).toBe(true);
    expect(calls).toEqual([["moveCard", "a", "reviewing", null]]);
  });

  it("move_card places the card before another card in the target column", async () => {
    const { handlers, calls } = setup([card("a", "inbox", 1), card("b", "reviewing", 2)]);
    const res = await dispatchBridgeRequest(
      {
        id: "1",
        tool: "move_card",
        args: { card_id: "a", column_id: "reviewing", before_card_id: "b" },
      },
      handlers,
    );
    expect(res.ok).toBe(true);
    expect(calls).toEqual([["moveCard", "a", "reviewing", "b"]]);
  });

  it("move_card rejects unknown cards, unknown columns and bad anchors", async () => {
    const { handlers, calls } = setup([card("a", "inbox", 1), card("b", "inbox", 2)]);
    const bad = [
      { card_id: "nope", column_id: "inbox" },
      { card_id: "a", column_id: "nope" },
      { card_id: "a", column_id: "reviewing", before_card_id: "b" },
      { card_id: "a", column_id: "inbox", before_card_id: "a" },
    ];
    for (const args of bad) {
      const res = await dispatchBridgeRequest({ id: "1", tool: "move_card", args }, handlers);
      expect(res.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("move_card rejects archived cards", async () => {
    const { handlers } = setup([card("a", "inbox", 1, { archived: true })]);
    const res = await dispatchBridgeRequest(
      { id: "1", tool: "move_card", args: { card_id: "a", column_id: "reviewing" } },
      handlers,
    );
    expect(res).toEqual({ id: "1", ok: false, error: "Card a is archived; unarchive it first" });
  });

  it("archive_card, unarchive_card and set_note call their handlers", async () => {
    const { handlers, calls } = setup([
      card("a", "inbox", 1),
      card("x", "inbox", 2, { archived: true }),
    ]);
    await dispatchBridgeRequest(
      { id: "1", tool: "archive_card", args: { card_id: "a" } },
      handlers,
    );
    await dispatchBridgeRequest(
      { id: "2", tool: "unarchive_card", args: { card_id: "x" } },
      handlers,
    );
    await dispatchBridgeRequest(
      { id: "3", tool: "set_note", args: { card_id: "a", note: "ping author" } },
      handlers,
    );
    expect(calls).toEqual([
      ["archiveCard", "a"],
      ["unarchiveCard", "x"],
      ["setNote", "a", "ping author"],
    ]);
  });

  it("set_note rejects notes longer than 200 characters", async () => {
    const { handlers, calls } = setup([card("a", "inbox", 1)]);
    const res = await dispatchBridgeRequest(
      { id: "1", tool: "set_note", args: { card_id: "a", note: "x".repeat(201) } },
      handlers,
    );
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("rejects unknown tools and malformed args", async () => {
    const { handlers } = setup([card("a", "inbox", 1)]);
    const unknown = await dispatchBridgeRequest(
      { id: "1", tool: "drop_table" as never, args: {} },
      handlers,
    );
    expect(unknown).toEqual({ id: "1", ok: false, error: "Unknown tool: drop_table" });
    const malformed = await dispatchBridgeRequest(
      { id: "2", tool: "archive_card", args: { card_id: 42 } },
      handlers,
    );
    expect(malformed.ok).toBe(false);
  });

  it("turns handler errors into error responses", async () => {
    const { handlers } = setup([card("a", "inbox", 1)]);
    handlers.archiveCard = async () => {
      throw new Error("storage full");
    };
    const res = await dispatchBridgeRequest(
      { id: "1", tool: "archive_card", args: { card_id: "a" } },
      handlers,
    );
    expect(res).toEqual({ id: "1", ok: false, error: "storage full" });
  });
});
