// Stateful keyboard-navigation decisions for the board: given the current
// grid of visible card ids, decide what a Shift/Ctrl-modified arrow move
// should do. Wraps the pure grid math in card-navigation.ts with the one
// piece of memory a move needs -- where a card sat before it left a column,
// so moving it back drops it into its old slot instead of the end.
//
// Framework- and DOM-agnostic: every method takes the grid (and any
// eligibility checks) as plain arguments and returns what should happen
// rather than performing it. Callers own onReorderCard, focus, and any DOM
// work (scrollIntoView, animation waits) -- this module never touches those.

import { columnEdgeId, nextCardId, type Dir } from "./card-navigation";

export type FocusResult = { focus: string };
export type ReorderResult = {
	reorder: { cardId: string; targetCardId: string | null; column: string };
	focus: string;
};
export type NavResult = FocusResult | ReorderResult;

function locate(grid: string[][], id: string): { col: number; row: number } | null {
	for (let c = 0; c < grid.length; c++) {
		const r = grid[c].indexOf(id);
		if (r >= 0) return { col: c, row: r };
	}
	return null;
}

export function createBoardNav() {
	// Remembers where a card sat before a keyboard column-move, so moving it
	// back drops it into its old slot instead of the end. Keyed by card id;
	// `beforeId` is the card it used to sit above (null = it was last). Plain
	// memory, not reactive -- it only informs the next move.
	const returnSlots = new Map<string, { column: string; beforeId: string | null }>();

	return {
		/** Plain arrow: which card to focus next (null = no-op, already there). */
		moveFocus(grid: string[][], focusedCardId: string | null, dir: Dir): FocusResult | null {
			const id = nextCardId(grid, focusedCardId, dir);
			return id ? { focus: id } : null;
		},

		/** Ctrl/Cmd+Up/Down: jump focus to the top/bottom of the current column. */
		focusColumnEdge(
			grid: string[][],
			focusedCardId: string | null,
			edge: "up" | "down",
		): FocusResult | null {
			const id = columnEdgeId(grid, focusedCardId, edge === "up" ? "top" : "bottom");
			return id ? { focus: id } : null;
		},

		/**
		 * Shift+Arrow: reorder the focused card.
		 *
		 * Up/down reorders within the current column, and is refused when
		 * `isReorderable` says the column's order is unavailable right now
		 * (a synthetic bucket, or an active sort that re-derives display order
		 * from something other than `order`, making the write an invisible
		 * no-op).
		 *
		 * Left/right moves the card into the neighbouring column -- always a
		 * real, visible move regardless of that column's sort/group state, so
		 * it's only refused when `canReceiveCard` says the column can't hold
		 * cards at all (the orphaned bucket). The first move out of a column
		 * remembers the slot the card sat in; moving back into that same
		 * column restores it instead of appending at the end.
		 */
		moveCard(
			grid: string[][],
			colIds: string[],
			focusedCardId: string | null,
			dir: Dir,
			isReorderable: (colId: string) => boolean,
			canReceiveCard: (colId: string) => boolean,
		): ReorderResult | null {
			if (!focusedCardId) return null;
			const pos = locate(grid, focusedCardId);
			if (!pos) return null;
			const { col, row } = pos;
			const id = focusedCardId;

			if (dir === "up" || dir === "down") {
				const columnId = colIds[col];
				if (!isReorderable(columnId)) return null;
				const cardIds = grid[col];
				if (dir === "up") {
					if (row === 0) return null;
					return {
						reorder: { cardId: id, targetCardId: cardIds[row - 1], column: columnId },
						focus: id,
					};
				}
				if (row >= cardIds.length - 1) return null;
				return {
					reorder: { cardId: id, targetCardId: cardIds[row + 2] ?? null, column: columnId },
					focus: id,
				};
			}

			const step = dir === "left" ? -1 : 1;
			const targetIdx = col + step;
			if (targetIdx < 0 || targetIdx >= colIds.length) return null;
			const targetColId = colIds[targetIdx];
			if (!canReceiveCard(targetColId)) return null;

			const originColId = colIds[col];
			const targetCol = grid[targetIdx];
			const remembered = returnSlots.get(id);

			let targetCardId: string | null;
			if (remembered && remembered.column === targetColId) {
				// Returning to the column we just left -> restore the old slot.
				targetCardId =
					remembered.beforeId && targetCol.includes(remembered.beforeId)
						? remembered.beforeId
						: null;
				returnSlots.delete(id);
			} else {
				// Leaving a column -> remember the card we sat above, and land at
				// the same row in the target so the layout stays predictable.
				returnSlots.set(id, { column: originColId, beforeId: grid[col][row + 1] ?? null });
				targetCardId = targetCol[row] ?? null;
			}
			return { reorder: { cardId: id, targetCardId, column: targetColId }, focus: id };
		},

		/** Ctrl/Cmd+Shift+Up/Down: reorder the focused card to the very top/bottom of its column. */
		moveCardToEdge(
			grid: string[][],
			colIds: string[],
			focusedCardId: string | null,
			dir: "up" | "down",
			isReorderable: (colId: string) => boolean,
		): ReorderResult | null {
			if (!focusedCardId) return null;
			const pos = locate(grid, focusedCardId);
			if (!pos) return null;
			const { col, row } = pos;
			const columnId = colIds[col];
			if (!isReorderable(columnId)) return null;
			const cardIds = grid[col];
			const id = focusedCardId;
			if (dir === "up") {
				if (row === 0) return null;
				return { reorder: { cardId: id, targetCardId: cardIds[0], column: columnId }, focus: id };
			}
			if (row >= cardIds.length - 1) return null;
			return { reorder: { cardId: id, targetCardId: null, column: columnId }, focus: id };
		},
	};
}

export type BoardNav = ReturnType<typeof createBoardNav>;
