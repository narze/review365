# Column Group By Repo

## Goal

Let a reviewer cluster a column's cards by repo, so PRs from the same repo sit
together and are easy to scan, without leaving the column or losing the
column's existing sort.

## Interaction

- Each column's options panel (opened via the `⋯`-style header button, next
  to the existing **Sort** section) gains a **Group** section with a single
  toggle: **Group by repo**.
- Turning it on rearranges the column's visible cards into repo clusters.
  Clusters are ordered alphabetically by repo full name (`owner/name`).
  Within a cluster, cards keep whatever order the column's active sort (or
  drag order, if `default`) already produces — grouping only clusters, it
  never re-sorts within a repo.
- A small label sits above each cluster's first card: the repo's full name
  and how many of its cards are in the column, e.g. `narze/review365 · 3`.
  This still shows for a column where every card shares one repo — the label
  costs nothing and confirms which repo it is.
- The toggle follows the same "stays open" precedent as Sort: picking it
  doesn't close the panel, so a reviewer can compare grouped vs. ungrouped
  against the live column. Escape or an outside click closes the panel as
  usual.
- The column header's status line reflects both active view options at once,
  e.g. `Sorted by PR number ↑ · Grouped by repo`, matching the existing
  "Sorted by …" line.
- Grouping is per-column, transient view state — like sort mode, it is not
  written to board state and resets on reload.
- Grouping composes with the text filter and the archived toggle exactly like
  sort does: it operates on whatever cards are already visible.

## Reordering while grouped

Grouping rearranges cards away from their raw `order`, the same way an
active sort already does. Reuse that precedent exactly:

- Keyboard `Shift+↑/↓` (reorder within column) and `Shift+Ctrl/Cmd+↑/↓` (move
  to column edge) are skipped while a column is grouped, mirroring how they
  already skip while a non-default sort is active.
- Mouse drag-and-drop is left alone (as it already is under an active sort):
  a drop still writes the dragged card's `order`, but the column immediately
  re-clusters, so a drop that lands "mid-cluster" may not visibly move the
  card. This is the existing, accepted behavior for sorted columns and
  grouping should not special-case it further.

## Implementation

- Add a pure `groupCardsByRepo(cards)` helper (generic over anything with a
  `repo: string`) to a new `apps/web/src/lib/card-grouping.ts`, following the
  `card-filter.ts` precedent of keeping list logic outside Svelte so it is
  unit-testable directly.
- Apply grouping in `KanbanBoard.svelte`'s existing `cardsForColumn`, after
  the sort switch: sort first, then (if the column is grouped) run the
  result through `groupCardsByRepo`. This keeps `KanbanColumn.svelte`
  agnostic of *how* order was produced — same contract sort already uses.
  Keyboard navigation (`nav.grid`) already reads from `cardsForColumn`, so it
  automatically follows the grouped/sorted order with no separate wiring.
- Track grouped columns the same way `columnSorts` tracks sort mode: a
  `Set<ColumnId>` of currently-grouped column ids in `KanbanBoard.svelte`.
- `KanbanColumn.svelte` renders the per-repo label by comparing each visible
  card's `repo` against the previous one in iteration order — no extra data
  structure needed beyond the already-grouped `cards` prop.
- The orphaned-cards pseudo-column (`__orphaned__`) is not wired to grouping,
  matching how it is already not wired to sort today (see Non-goals).

## Testing

- Unit tests in `card-grouping.test.ts`: empty input, single repo, multiple
  repos (clusters ordered alphabetically, order preserved within a cluster),
  and repeated/interleaved repos.
- A Playwright test toggles **Group by repo** on a column seeded with cards
  from two repos, asserts the on-screen card order clusters by repo with
  labels visible, and asserts turning it back off restores the prior order.

## Non-goals

- No persistence — like sort mode, grouping resets on reload.
- No grouping by any field other than repo (e.g. author) in this iteration.
- No collapsing/collapsible clusters — labels are informational only.
- The orphaned-cards column does not get a grouping control, consistent with
  it not having a sort control today.
