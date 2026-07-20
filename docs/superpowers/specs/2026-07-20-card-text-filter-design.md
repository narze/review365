# Card Text Filter

## Goal

Let a reviewer narrow the board to the cards they care about by typing free text,
without leaving the board or touching the repo watchlist.

## Interaction

- A search box sits in the board toolbar, next to the repo filter.
- Typing filters every column at once: a card stays on the board only when it
  matches the query. Clearing the box (or pressing the ✕) restores every card.
- Matching is a case-insensitive substring test across the card's **title,
  author, repo, PR number, and note**. A leading `#` is optional, so both `123`
  and `#123` find PR 123.
- Whitespace-separated terms are ANDed — `narze auth` keeps cards authored by
  narze whose text also mentions auth.
- The toolbar status line reflects the filter: `3 of 12 PRs match "auth"`.
- When a query matches nothing, a hint (`🔍 No cards match "…"`) with an inline
  clear action appears below the toolbar so an empty board never looks broken.

## Implementation

- Matching lives in `apps/web/src/lib/card-filter.ts` as a pure
  `cardMatchesQuery(card, query)` (plus a `filterCardsByQuery` helper), so it is
  unit-tested independently of Svelte.
- The text filter composes with the existing repo watchlist inside
  `KanbanBoard.svelte`: `watchedCards` is the repo-filtered set, and
  `filteredCards` narrows it by the query. Everything downstream — columns,
  orphans, archived count, keyboard navigation — already reads from
  `filteredCards`, so the filter applies board-wide from that single place.
- The query is derived from the trimmed input so leading/trailing whitespace
  never changes results or triggers the empty state.

## Testing

- Unit tests in `card-filter.test.ts` cover empty queries, per-field matches,
  the `#`-optional PR number, multi-term AND, and the no-cross-field-straddle
  guarantee.
- A Playwright test drives the toolbar box: filter by title, author, and PR
  number, confirm the no-match hint, and confirm ✕ restores the board.

## Non-goals

- No persistence — the filter is transient view state and resets on reload.
- No regex, field-scoped syntax (`author:`), or fuzzy matching; plain substring
  matching keeps the mental model simple.
