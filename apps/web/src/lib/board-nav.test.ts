import { describe, expect, it } from "bun:test";
import { createBoardNav } from "./board-nav";

// colB is deliberately sortable-but-blocked ("sorted"), colD is grouped, and
// "orphaned" stands in for the synthetic orphaned-cards bucket -- neither
// predicate below ever has to know those labels, only what they mean.
const grid = [["a1", "a2", "a3"], ["b1", "b2"], [], ["d1", "d2"]];
const colIds = ["colA", "sorted", "orphaned", "grouped"];

const isReorderable = (colId: string) => colId !== "orphaned" && colId !== "sorted" && colId !== "grouped";
const canReceiveCard = (colId: string) => colId !== "orphaned";

describe("moveFocus", () => {
	it("delegates to the pure grid math", () => {
		const nav = createBoardNav();
		expect(nav.moveFocus(grid, "a1", "down")).toEqual({ focus: "a2" });
		expect(nav.moveFocus(grid, null, "down")).toEqual({ focus: "a1" });
	});

	it("re-targets the same card at an edge, rather than returning null", () => {
		// nextCardId clamps and returns the current id at an edge -- matches the
		// pre-extraction behaviour of re-running focusCard on a no-op move.
		const nav = createBoardNav();
		expect(nav.moveFocus(grid, "a1", "up")).toEqual({ focus: "a1" });
	});

	it("returns null only when the grid has no cards to enter", () => {
		const nav = createBoardNav();
		expect(nav.moveFocus([[], []], null, "down")).toBeNull();
	});
});

describe("focusColumnEdge", () => {
	it("delegates to the pure grid math, ignoring reorderability", () => {
		const nav = createBoardNav();
		expect(nav.focusColumnEdge(grid, "a2", "up")).toEqual({ focus: "a1" });
		expect(nav.focusColumnEdge(grid, "a2", "down")).toEqual({ focus: "a3" });
		// works even inside a column moveCard would refuse to reorder
		expect(nav.focusColumnEdge(grid, "d1", "down")).toEqual({ focus: "d2" });
	});

	it("returns null when there's no current card", () => {
		const nav = createBoardNav();
		expect(nav.focusColumnEdge(grid, null, "up")).toBeNull();
	});
});

describe("moveCard: up/down (in-column reorder)", () => {
	it("targets the card above on up, and the one two rows down on down", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "a2", "up", isReorderable, canReceiveCard)).toEqual({
			reorder: { cardId: "a2", targetCardId: "a1", column: "colA" },
			focus: "a2",
		});
		expect(nav.moveCard(grid, colIds, "a1", "down", isReorderable, canReceiveCard)).toEqual({
			reorder: { cardId: "a1", targetCardId: "a3", column: "colA" },
			focus: "a1",
		});
	});

	it("moving the last card down targets null (append at the end)", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "a2", "down", isReorderable, canReceiveCard)).toEqual({
			reorder: { cardId: "a2", targetCardId: null, column: "colA" },
			focus: "a2",
		});
	});

	it("is a no-op at the top/bottom edge", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "a1", "up", isReorderable, canReceiveCard)).toBeNull();
		expect(nav.moveCard(grid, colIds, "a3", "down", isReorderable, canReceiveCard)).toBeNull();
	});

	it("refuses when the column isn't reorderable (sorted, grouped, or orphaned)", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "b1", "down", isReorderable, canReceiveCard)).toBeNull();
		expect(nav.moveCard(grid, colIds, "d1", "down", isReorderable, canReceiveCard)).toBeNull();
	});

	it("returns null when nothing is focused, or the focused id isn't on the grid", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, null, "up", isReorderable, canReceiveCard)).toBeNull();
		expect(nav.moveCard(grid, colIds, "ghost", "up", isReorderable, canReceiveCard)).toBeNull();
	});
});

describe("moveCard: left/right (cross-column move)", () => {
	it("lands at the same row in the target column on first move, ignoring the target's own reorder state", () => {
		const nav = createBoardNav();
		// colA -> "sorted": sorted, but that only blocks in-column reorder, not
		// a card actually arriving from elsewhere.
		expect(nav.moveCard(grid, colIds, "a2", "right", isReorderable, canReceiveCard)).toEqual({
			reorder: { cardId: "a2", targetCardId: "b2", column: "sorted" },
			focus: "a2",
		});
	});

	it("clamps to the end of a shorter target column", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "a3", "right", isReorderable, canReceiveCard)).toEqual({
			reorder: { cardId: "a3", targetCardId: null, column: "sorted" },
			focus: "a3",
		});
	});

	it("refuses to move into the orphaned bucket", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "b1", "right", isReorderable, canReceiveCard)).toBeNull();
	});

	it("is a no-op at the board's horizontal edges", () => {
		const nav = createBoardNav();
		expect(nav.moveCard(grid, colIds, "a1", "left", isReorderable, canReceiveCard)).toBeNull();
		expect(nav.moveCard(grid, colIds, "d1", "right", isReorderable, canReceiveCard)).toBeNull();
	});

	it("remembers the old slot and restores it when the card comes back", () => {
		const nav = createBoardNav();
		// a2 leaves colA (sat above a3, remembered) and lands in "sorted"
		// ahead of b2 -- reflect that landing in the grid for the return move.
		nav.moveCard(grid, colIds, "a2", "right", isReorderable, canReceiveCard);
		const afterMove = [["a1", "a3"], ["b1", "a2", "b2"], [], ["d1", "d2"]];

		const back = nav.moveCard(afterMove, colIds, "a2", "left", isReorderable, canReceiveCard);
		expect(back).toEqual({
			reorder: { cardId: "a2", targetCardId: "a3", column: "colA" },
			focus: "a2",
		});
	});

	it("falls back to appending at the end when the remembered card is gone", () => {
		const nav = createBoardNav();
		nav.moveCard(grid, colIds, "a2", "right", isReorderable, canReceiveCard);
		// a3 (the remembered beforeId) was archived out of colA in the meantime.
		const afterMove = [["a1"], ["b1", "a2", "b2"], [], ["d1", "d2"]];
		const back = nav.moveCard(afterMove, colIds, "a2", "left", isReorderable, canReceiveCard);
		expect(back).toEqual({
			reorder: { cardId: "a2", targetCardId: null, column: "colA" },
			focus: "a2",
		});
	});

	it("returnSlots is keyed per card id -- another card's move isn't affected by it", () => {
		const nav = createBoardNav();
		nav.moveCard(grid, colIds, "a2", "right", isReorderable, canReceiveCard); // remembers "a2" only
		// b2 has no memory of its own, so this is a fresh move: lands at its row.
		const forward = nav.moveCard(grid, colIds, "b2", "left", isReorderable, canReceiveCard);
		expect(forward).toEqual({
			reorder: { cardId: "b2", targetCardId: "a2", column: "colA" },
			focus: "b2",
		});
	});
});

describe("moveCardToEdge", () => {
	it("targets the first card on up, and null (append) on down", () => {
		const nav = createBoardNav();
		expect(nav.moveCardToEdge(grid, colIds, "a2", "up", isReorderable)).toEqual({
			reorder: { cardId: "a2", targetCardId: "a1", column: "colA" },
			focus: "a2",
		});
		expect(nav.moveCardToEdge(grid, colIds, "a2", "down", isReorderable)).toEqual({
			reorder: { cardId: "a2", targetCardId: null, column: "colA" },
			focus: "a2",
		});
	});

	it("is a no-op at the edge it's already jumping to", () => {
		const nav = createBoardNav();
		expect(nav.moveCardToEdge(grid, colIds, "a1", "up", isReorderable)).toBeNull();
		expect(nav.moveCardToEdge(grid, colIds, "a3", "down", isReorderable)).toBeNull();
	});

	it("refuses when the column isn't reorderable", () => {
		const nav = createBoardNav();
		expect(nav.moveCardToEdge(grid, colIds, "d1", "down", isReorderable)).toBeNull();
	});

	it("returns null when nothing is focused", () => {
		const nav = createBoardNav();
		expect(nav.moveCardToEdge(grid, colIds, null, "up", isReorderable)).toBeNull();
	});
});

describe("returnSlots encapsulation", () => {
	it("is private per instance -- a fresh createBoardNav() has no memory", () => {
		const first = createBoardNav();
		first.moveCard(grid, colIds, "a2", "right", isReorderable, canReceiveCard);

		const second = createBoardNav();
		// Without a remembered slot, "b2" lands at its row rather than reusing
		// the "a2" memory the first instance learned.
		const result = second.moveCard(grid, colIds, "b2", "left", isReorderable, canReceiveCard);
		expect(result).toEqual({
			reorder: { cardId: "b2", targetCardId: "a2", column: "colA" },
			focus: "b2",
		});
	});
});
