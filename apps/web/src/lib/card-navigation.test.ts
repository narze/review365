import { describe, expect, it } from "bun:test";
import { columnEdgeId, nextCardId } from "./card-navigation";

const grid = [["a1", "a2", "a3"], ["b1", "b2"], [], ["d1"]];

describe("nextCardId", () => {
  it("enters at first card of first non-empty column", () => {
    expect(nextCardId(grid, null, "down")).toBe("a1");
    expect(nextCardId([[], ["x1"]], null, "right")).toBe("x1");
    expect(nextCardId([[], []], null, "down")).toBeNull();
  });

  it("treats an unknown id as entry", () => {
    expect(nextCardId(grid, "ghost", "up")).toBe("a1");
  });

  it("moves within a column and clamps at the ends", () => {
    expect(nextCardId(grid, "a1", "down")).toBe("a2");
    expect(nextCardId(grid, "a3", "down")).toBe("a3"); // bottom edge
    expect(nextCardId(grid, "a2", "up")).toBe("a1");
    expect(nextCardId(grid, "a1", "up")).toBe("a1"); // top edge
  });

  it("moves across columns keeping the row, clamped to the target length", () => {
    expect(nextCardId(grid, "a1", "right")).toBe("b1");
    expect(nextCardId(grid, "a3", "right")).toBe("b2"); // row 2 clamped to b's length
    expect(nextCardId(grid, "b1", "left")).toBe("a1");
  });

  it("skips empty columns when moving sideways", () => {
    expect(nextCardId(grid, "b1", "right")).toBe("d1"); // hops over empty col 2
    expect(nextCardId(grid, "d1", "left")).toBe("b1");
  });

  it("stays put at the board's horizontal edges", () => {
    expect(nextCardId(grid, "a1", "left")).toBe("a1");
    expect(nextCardId(grid, "d1", "right")).toBe("d1");
  });

  it("handles single-card and single-column grids", () => {
    expect(nextCardId([["only"]], "only", "down")).toBe("only");
    expect(nextCardId([["only"]], "only", "right")).toBe("only");
  });
});

describe("columnEdgeId", () => {
  it("returns the top and bottom card of the current column", () => {
    expect(columnEdgeId(grid, "a2", "top")).toBe("a1");
    expect(columnEdgeId(grid, "a2", "bottom")).toBe("a3");
    expect(columnEdgeId(grid, "b1", "bottom")).toBe("b2");
  });

  it("returns the card itself when already at that edge", () => {
    expect(columnEdgeId(grid, "a1", "top")).toBe("a1");
    expect(columnEdgeId(grid, "d1", "bottom")).toBe("d1"); // single-card column
  });

  it("returns null for no current card or an unknown id", () => {
    expect(columnEdgeId(grid, null, "top")).toBeNull();
    expect(columnEdgeId(grid, "ghost", "bottom")).toBeNull();
  });
});
