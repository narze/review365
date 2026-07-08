import { describe, expect, it } from "bun:test";
import type { BoardState, AutomationRule } from "./types";
import {
  getCardColumn,
  setCardColumn,
  updateNote,
  reorderCard,
  archiveCard,
  unarchiveCard,
  getEnabledRepos,
  toggleRepo,
  findOrphanedCards,
  applyAutomation,
} from "./store";

function emptyState(): BoardState {
  return { cards: {} };
}

function stateWith(cardId: string, column: string, order = 0, extra?: Record<string, unknown>) {
  return { cards: { [cardId]: { column, order, ...extra } } };
}

// ── getCardColumn ──

describe("getCardColumn", () => {
  it("returns column for known card", () => {
    const s = stateWith("pr_a", "reviewing");
    expect(getCardColumn(s, "pr_a")).toBe("reviewing");
  });

  it("returns default inbox for unknown card", () => {
    expect(getCardColumn(emptyState(), "pr_x")).toBe("inbox");
  });
});

// ── setCardColumn ──

describe("setCardColumn", () => {
  it("sets column and marks manual", () => {
    const s = setCardColumn(emptyState(), "pr_a", "approved");
    expect(s.cards["pr_a"]).toEqual({
      column: "approved",
      order: expect.any(Number),
      manual: true,
    });
  });

  it("preserves archived flag", () => {
    const base = stateWith("pr_a", "inbox", 100, { archived: true });
    const s = setCardColumn(base, "pr_a", "reviewing");
    expect(s.cards["pr_a"].archived).toBe(true);
    expect(s.cards["pr_a"].manual).toBe(true);
  });
});

// ── reorderCard ──

describe("reorderCard", () => {
  it("reorders within same column (insert before target)", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10 },
        pr_b: { column: "inbox", order: 20 },
        pr_c: { column: "inbox", order: 30 },
      },
    };
    const result = reorderCard(structuredClone(s), "pr_a", "pr_c", "inbox");
    // Before: a(10), b(20), c(30)
    // Move a before c (target=c): should become b, a, c
    const inbox = Object.entries(result.cards)
      .filter(([, c]) => c.column === "inbox")
      .sort((a, b) => a[1].order - b[1].order);
    expect(inbox.map(([id]) => id)).toEqual(["pr_b", "pr_a", "pr_c"]);
  });

  it("cross-column reorder with target", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10 },
        pr_b: { column: "reviewing", order: 10 },
        pr_c: { column: "reviewing", order: 20 },
      },
    };
    const result = reorderCard(structuredClone(s), "pr_a", "pr_c", "reviewing");
    expect(result.cards["pr_a"].column).toBe("reviewing");
    expect(result.cards["pr_a"].manual).toBe(true);
    // a should be before c
    const reviewing = Object.entries(result.cards)
      .filter(([, c]) => c.column === "reviewing")
      .sort((a, b) => a[1].order - b[1].order);
    expect(reviewing.map(([id]) => id)).toEqual(["pr_b", "pr_a", "pr_c"]);
  });

  it("cross-column reorder to empty column", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10 },
      },
    };
    const result = reorderCard(structuredClone(s), "pr_a", null, "reviewing");
    expect(result.cards["pr_a"].column).toBe("reviewing");
    expect(result.cards["pr_a"].manual).toBe(true);
  });

  it("marks all reordered cards as manual", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10 },
        pr_b: { column: "inbox", order: 20 },
      },
    };
    const result = reorderCard(structuredClone(s), "pr_b", "pr_a", "inbox");
    expect(result.cards["pr_a"].manual).toBe(true);
    expect(result.cards["pr_b"].manual).toBe(true);
  });

  it("preserves archived flag on reordered card", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10, archived: true },
        pr_b: { column: "inbox", order: 20 },
      },
    };
    const result = reorderCard(structuredClone(s), "pr_a", "pr_b", "inbox");
    expect(result.cards["pr_a"].archived).toBe(true);
  });
});

// ── updateNote ──

describe("updateNote", () => {
  it("sets note on card", () => {
    const s = stateWith("pr_a", "inbox");
    const result = updateNote(s, "pr_a", "check this one");
    expect(result.cards["pr_a"].note).toBe("check this one");
  });

  it("truncates note over 200 chars", () => {
    const s = stateWith("pr_a", "inbox");
    const longNote = "a".repeat(250);
    const result = updateNote(s, "pr_a", longNote);
    expect(result.cards["pr_a"].note?.length).toBe(200);
  });

  it("removes note when set to empty string", () => {
    const s = stateWith("pr_a", "inbox", 10, { note: "old note" });
    const result = updateNote(s, "pr_a", "");
    expect(result.cards["pr_a"].note).toBeUndefined();
  });
});

// ── archive / unarchive ──

describe("archiveCard", () => {
  it("sets archived flag", () => {
    const s = stateWith("pr_a", "inbox");
    const result = archiveCard(s, "pr_a");
    expect(result.cards["pr_a"].archived).toBe(true);
  });
});

describe("unarchiveCard", () => {
  it("removes archived flag", () => {
    const s = stateWith("pr_a", "inbox", 10, { archived: true });
    const result = unarchiveCard(s, "pr_a");
    expect(result.cards["pr_a"].archived).toBeUndefined();
  });

  it("noops for unknown card", () => {
    const result = unarchiveCard(emptyState(), "pr_x");
    expect(result).toEqual(emptyState());
  });
});

// ── toggleRepo ──

describe("toggleRepo", () => {
  it("adds repo to enabledRepos", () => {
    const result = toggleRepo(emptyState(), "owner/repo");
    expect(result.enabledRepos).toContain("owner/repo");
  });

  it("removes repo from enabledRepos but keeps its cards' state", () => {
    const s: BoardState = {
      cards: {
        pr_owner_repo_1: { column: "reviewing", order: 10, manual: true },
        pr_other_repo_2: { column: "inbox", order: 20 },
      },
      enabledRepos: ["owner/repo", "other/repo"],
    };
    const result = toggleRepo(s, "owner/repo");
    expect(result.enabledRepos).not.toContain("owner/repo");
    expect(result.enabledRepos).toContain("other/repo");
    // Card state is preserved (not deleted) so re-watching the repo later
    // restores the card to wherever it was manually placed.
    expect(result.cards.pr_owner_repo_1).toEqual({ column: "reviewing", order: 10, manual: true });
    expect(result.cards.pr_other_repo_2).toEqual({ column: "inbox", order: 20 });
  });

  it("restores a card's manual placement when re-watching a repo", () => {
    const s: BoardState = {
      cards: { pr_owner_repo_1: { column: "reviewing", order: 10, manual: true } },
      enabledRepos: ["owner/repo"],
    };
    const removed = toggleRepo(s, "owner/repo");
    const readded = toggleRepo(removed, "owner/repo");
    expect(readded.enabledRepos).toContain("owner/repo");
    expect(readded.cards.pr_owner_repo_1).toEqual({
      column: "reviewing",
      order: 10,
      manual: true,
    });
  });
});

describe("getEnabledRepos", () => {
  it("returns empty array when not set", () => {
    expect(getEnabledRepos(emptyState())).toEqual([]);
  });

  it("returns enabled repos", () => {
    const s: BoardState = { cards: {}, enabledRepos: ["a/b"] };
    expect(getEnabledRepos(s)).toEqual(["a/b"]);
  });
});

// ── findOrphanedCards ──

describe("findOrphanedCards", () => {
  it("finds cards in deleted columns", () => {
    const s: BoardState = {
      cards: {
        pr_a: { column: "inbox", order: 10 },
        pr_b: { column: "deleted_col", order: 20 },
      },
    };
    const config = { columns: [{ id: "inbox", title: "Inbox" }], rules: [] };
    const orphans = findOrphanedCards(s, config);
    expect(orphans).toEqual([{ cardId: "pr_b", column: "deleted_col" }]);
  });

  it("returns empty when all columns exist", () => {
    const s = stateWith("pr_a", "inbox");
    const config = { columns: [{ id: "inbox", title: "Inbox" }], rules: [] };
    expect(findOrphanedCards(s, config)).toEqual([]);
  });
});

// ── applyAutomation ──

describe("applyAutomation", () => {
  const rules: AutomationRule[] = [
    { id: "r1", signal: "merged", columnId: "merged" },
    { id: "r2", signal: "approved", columnId: "approved" },
    { id: "r3", signal: "review-requested", columnId: "inbox" },
  ];

  it("applies matching rule", () => {
    const s = emptyState();
    const signals = { pr_a: ["approved"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].column).toBe("approved");
  });

  it("first matching rule wins", () => {
    const s = emptyState();
    const signals = { pr_a: ["merged", "approved"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].column).toBe("merged");
  });

  it("skips archived cards", () => {
    const s = stateWith("pr_a", "inbox", 10, { archived: true });
    const signals = { pr_a: ["approved"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].column).toBe("inbox");
  });

  it("skips manually placed cards for non-merged signals", () => {
    const s = stateWith("pr_a", "reviewing", 10, { manual: true });
    const signals = { pr_a: ["approved"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].column).toBe("reviewing");
  });

  it("overrides manual placement for merged signal", () => {
    const s = stateWith("pr_a", "reviewing", 10, { manual: true });
    const signals = { pr_a: ["merged"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].column).toBe("merged");
  });

  it("does not modify state when no rules match", () => {
    const s = emptyState();
    const signals = { pr_a: ["pr-open"] };
    const result = applyAutomation(s, signals, rules);
    expect(result).toEqual(s);
  });

  it("preserves existing card properties", () => {
    const s = stateWith("pr_a", "inbox", 100);
    const signals = { pr_a: ["approved"] };
    const result = applyAutomation(s, signals, rules);
    expect(result.cards["pr_a"].order).toBe(100);
    expect(result.cards["pr_a"].column).toBe("approved");
  });
});
