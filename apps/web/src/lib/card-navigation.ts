// Pure grid math for keyboard focus navigation across the Kanban board.
// No DOM: `grid` is the columns of visible card ids in on-screen order, so the
// same logic drives focus regardless of how columns/cards render.

export type Dir = "up" | "down" | "left" | "right";

function firstCard(grid: string[][]): string | null {
  for (const col of grid) {
    if (col.length > 0) return col[0];
  }
  return null;
}

function locate(grid: string[][], id: string): { col: number; row: number } | null {
  for (let c = 0; c < grid.length; c++) {
    const r = grid[c].indexOf(id);
    if (r >= 0) return { col: c, row: r };
  }
  return null;
}

// Returns the id to focus next. Entry (currentId null or unknown) → first card
// of the first non-empty column. A move that hits an edge returns currentId so
// the caller can treat "same id" as a no-op.
export function nextCardId(grid: string[][], currentId: string | null, dir: Dir): string | null {
  const pos = currentId ? locate(grid, currentId) : null;
  if (!pos) return firstCard(grid);

  const { col, row } = pos;

  if (dir === "up") return grid[col][Math.max(0, row - 1)];
  if (dir === "down") return grid[col][Math.min(grid[col].length - 1, row + 1)];

  // left / right: step across columns, skipping empty ones, keep row clamped.
  const step = dir === "left" ? -1 : 1;
  for (let c = col + step; c >= 0 && c < grid.length; c += step) {
    if (grid[c].length > 0) {
      return grid[c][Math.min(row, grid[c].length - 1)];
    }
  }
  return currentId;
}

// The first (top) or last (bottom) card of the column that holds currentId.
// Returns null when currentId is absent, so the caller leaves focus untouched.
export function columnEdgeId(
  grid: string[][],
  currentId: string | null,
  edge: "top" | "bottom",
): string | null {
  if (!currentId) return null;
  for (const col of grid) {
    if (col.includes(currentId)) {
      return edge === "top" ? col[0] : col[col.length - 1];
    }
  }
  return null;
}
