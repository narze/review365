# PROTOTYPE — column header menu UX

**Throwaway.** Question: _the menu items on the columns look bad — what should they be instead?_

Four variants of the column header, switchable on the existing board route via
`?variant=` and the floating bar at the bottom (`◀ ▶`, or `⌥←` / `⌥→` — plain
arrows are already the board's card navigation). The bar never renders in a
production build.

| Variant | Name                  | URL            |
| ------- | --------------------- | -------------- |
| `0`     | Current (baseline)    | `/`            |
| `A`     | One menu              | `/?variant=A`  |
| `B`     | Hover toolbar + chips | `/?variant=B`  |
| `C`     | Header panel          | `/?variant=C`  |

## What's wrong with the baseline (variant `0`)

Reproduced in the running app, not read off the source:

1. **Three icon-only controls competing** — `⋯` (a one-item menu), `⇅` (sort),
   `⠿` (drag). No labels, all in `text-dim` (neutral-400 on white,
   neutral-600 on near-black) — the lowest-contrast text token in the app.
2. **Hit targets ~16×16px.** WCAG 2.2 asks for 24×24 minimum. They also sit
   ~4px apart, so mis-clicks open the wrong menu.
3. **Copy feedback is invisible.** `copyStatus` is rendered as the label of the
   menu item that was just clicked — and the click closes the menu. "Copied" /
   "Copy failed" is written to an element nobody can see.
4. **Sort state is a glyph.** `🕐↑` / `#↓` — emoji rendering is
   platform-dependent and neither reads as "oldest first". Clearing a sort
   means opening the menu and picking "Drag order".
5. **Two menus, mutually exclusive**, each with its own open state — and only
   the sort one handles `Escape`.
6. **Menu markup fights assistive tech**: a full-screen `<button>` as the
   click-away catcher, no `role="menu"`, no arrow-key navigation, focus not
   returned to the trigger on close.
7. Menu is `w-32`, so labels are cramped, and it renders under the column title
   rather than under its trigger.

## What each variant argues

- **A — One menu.** One `⋯` (28×28) opens a single structured menu: a
  `SORT BY` section with full labels + hints and a checkmark, a divider, then
  actions. Sort state becomes a readable blue chip in the header that clears on
  click. Roving arrow-key focus, `Escape` closes and restores focus.
  _Most conservative; smallest delta from today._
- **B — Hover toolbar + chips.** Header is quiet at rest (title + count only);
  hover/focus reveals a real toolbar. **Copy is one click, not a menu item**,
  with the icon flipping to `✓`. Active sort lives on a second row as a
  dismissible chip. _Fastest for the common actions; costs discoverability
  (nothing visible until hover) and touch is hover-less._
- **C — Header panel.** The whole 40px header row is the trigger (with a `▾`),
  opening a wide panel: sort as a segmented control that **stays open** so you
  can flip sorts and watch the column re-order, plus full-width action rows with
  sub-labels. Sort state is a subtitle under the column title. _Most
  discoverable and touch-friendly; the panel covers the top cards while open._

All three fix problems 2–7. The interesting answer is probably a mix — e.g. B's
one-click copy and chips inside A's single menu.

## Run it

```bash
cd apps/web && bun run dev   # http://localhost:5173/?variant=A
```

## Cleanup when a winner is picked

Delete `src/components/prototype/`, `src/lib/prototype-variant.svelte.ts`, the
`{#if prototypeVariant.key === ...}` block in `KanbanColumn.svelte`, and the
`<PrototypeSwitcher />` in `routes/+layout.svelte`. Then rewrite the winning
header properly (this code has no tests and minimal error handling).
