# Card keyboard navigation — design

## Goal

Let a user drive the Kanban board from the keyboard: arrow keys move focus between
PR cards, the focused card scrolls into view, and a small set of keys act on it.

## Behaviour

### Navigation (arrow keys)

2D grid model over the board's columns and their visible cards.

- `↑` / `↓` — move focus within the current column, clamped at top/bottom.
- `←` / `→` — move focus to the card at the same row-index in the adjacent
  column, clamped to that column's card count. Empty adjacent columns are skipped.
- Pressing any arrow when no card is focused focuses the first card of the first
  non-empty column (entry).
- `Escape` clears focus.

The focused card scrolls into view (both the horizontal board scroll and the
vertical column scroll).

### Card actions (focused card only)

| Key                | Action                                          |
| ------------------ | ----------------------------------------------- |
| `Enter`            | Open the PR/MR url in a new tab                 |
| `Space`            | Toggle the title clamp/expand                   |
| `N`                | Start editing the card note                     |
| `Shift+↑`          | Move card up one position in its column         |
| `Shift+↓`          | Move card down one position in its column       |
| `Shift+←`          | Move card to the previous column                |
| `Shift+→`          | Move card to the next column                    |
| `Ctrl/Cmd+↑`       | Focus the topmost card of the current column    |
| `Ctrl/Cmd+↓`       | Focus the bottommost card of the current column |
| `Ctrl/Cmd+Shift+↑` | Move card to the top of its column              |
| `Ctrl/Cmd+Shift+↓` | Move card to the bottom of its column           |

`Ctrl/Cmd` acts on the vertical axis only; `Ctrl/Cmd+←/→` is left to the
browser. The jump keys act only when a card is already focused.

After a `Shift+Arrow` move the same card keeps focus and scrolls into view.

### Out of scope (YAGNI)

- Archive/unarchive via keyboard.
- Wrap-around at column/board edges.
- Multi-select.

## Architecture

Three units with clear boundaries.

### 1. `card-navigation.ts` (new, pure — no DOM)

Grid math, unit-testable in isolation.

```ts
type Dir = "up" | "down" | "left" | "right";

// grid: columns of visible card ids, in visual order.
// currentId: the focused card, or null for entry.
// Returns the next card id to focus, or null if the move is a no-op.
function nextCardId(grid: string[][], currentId: string | null, dir: Dir): string | null;
```

Rules:

- `currentId === null` → first id of the first non-empty column (any dir), else `null`.
- Locate `(col, row)` of `currentId`. If not present → treat as entry.
- `up`/`down` → `row ∓ 1`, clamped to `[0, colLen-1]`.
- `left`/`right` → step `col ∓ 1` (skipping empty columns), then
  `row' = min(row, adjColLen-1)`.
- No valid move (already at edge) → return `currentId` (caller treats same id as no-op).

### 2. `KanbanBoard.svelte` (wiring)

Owns focus state and the global key handler.

- `let focusedCardId = $state<string | null>(null)`.
- `const grid = $derived(...)` — for each column (in order) the visible card ids
  from `cardsForColumn(col.id)` filtered the same way `KanbanColumn` computes
  `visibleCards` (respects `showArchived`); appends the orphaned column's ids
  when present. Grid order must match on-screen order exactly.
- `$effect`: if `focusedCardId` is set but absent from `grid`, clear it (handles
  refresh / filter / repo changes).
- `window` `keydown` handler (added/removed in `$effect` with cleanup):
  1. **Guard** — bail if `event.target` is `input`, `textarea`, `select`, or
     `[contenteditable]`. Leaves note editing, repo search, and settings inputs alone.
  2. **Arrows** (no Shift) → `preventDefault`; `next = nextCardId(grid, focusedCardId, dir)`;
     if `next` and `next !== focusedCardId` set focus + scroll.
  3. **Shift+Arrows** → resolve the focused card's column and row from `grid`:
     - `Shift+←/→` → `onReorderCard(id, targetCardId, adjacentColId)`. The card
       lands at the **same row** in the target column (`grid[adj][row] ?? null`),
       not the end. A `returnSlots` map remembers the card it sat above before the
       move; moving it straight back to that column restores the exact slot.
     - `Shift+↑` → `onReorderCard(id, prevCardId, colId)` (target = card at `row-1`;
       no-op at `row 0`).
     - `Shift+↓` → `onReorderCard(id, afterNextCardId, colId)` where
       `afterNextCardId = grid[col][row+2] ?? null`; no-op if already last.
     - `Ctrl/Cmd+↑/↓` (focus) → `columnEdgeId`; `Ctrl/Cmd+Shift+↑/↓` (move) →
       reorder to `grid[col][0]` / `null` (top / bottom of the column).
     - Focus stays on `id`; scroll into view after the DOM updates.
- Focus + scroll helper: find the card by `data-card-id`, `el.focus({ preventScroll: true })`,
  then `el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })`.
  Run after `tick()`. A reorder plays an `animate:flip`, so first await the column's
  in-flight animations (`container.getAnimations({ subtree: true })`) — otherwise
  `scrollIntoView` reads the card's transformed mid-flight rect and scrolls to its
  old position. Bail if focus moved on while waiting.
- Passes `focusedCardId` down to each `KanbanColumn` → `KanbanCard`.

`reorderCard(state, cardId, targetCardId, column)` inserts `cardId` **before**
`targetCardId` (null = append), which is why `Shift+↓` targets `row+2`.

### 3. `KanbanCard.svelte` (focus indicator + card-local keys)

- New prop `focused = false`. Threaded through `KanbanColumn`
  (`focused={card.id === focusedCardId}`).
- Card wrapper gains `data-card-id={card.id}`, `tabindex={-1}`, and a focus ring
  when `focused` (`ring-2 ring-blue-500` or equivalent token).
- Wrapper `onkeydown` (fires only for the DOM-focused card):
  - `Enter` → open `card.url` in a new tab; `preventDefault`.
  - `Space` → toggle `expanded`; `preventDefault` (stop page scroll).
  - `n` / `N` → `startEditNote()` (guarded by `onUpdateNote` presence).
  - `stopPropagation` on handled keys so they don't reach the board handler.
  - Arrows are ignored here (handled at the board `window` level).

## Data flow

```
window keydown
  └─ KanbanBoard: guard → nextCardId(grid, focusedCardId, dir)
       ├─ arrows      → set focusedCardId → focus+scroll [data-card-id]
       └─ shift+arrow → onMoveCard / onReorderCard (id keeps focus) → focus+scroll

KanbanBoard.focusedCardId ──prop──> KanbanColumn ──prop──> KanbanCard.focused
                                                              └─ ring + data-card-id + tabindex=-1
KanbanCard wrapper keydown (focused only): Enter / Space / N
```

## Testing

- **Unit** (`card-navigation.test.ts`): `nextCardId` across up/down/left/right,
  clamping at edges, empty-column skipping, entry from `null`, unknown id → entry,
  single-column and single-card grids.
- **E2E** (extend `apps/web/e2e/board.e2e.ts`): arrow focus moves the ring and
  scrolls; `Shift+Arrow` moves a card and focus follows; `Enter`/`Space`/`N`
  behave; the window handler stays inert while a note input is focused.

## Edge cases

- Empty board / all columns empty → arrows do nothing (no entry target).
- Focused card removed by refresh or repo/filter change → focus clears.
- Orphaned column participates in navigation; `Shift+←/→` can move a card out of it.
- Archived cards are excluded from the grid unless `showArchived` is on (mirrors
  the column's own `visibleCards`).
