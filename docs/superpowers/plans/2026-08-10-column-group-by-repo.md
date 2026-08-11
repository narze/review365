# Column Group By Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-column "Group by repo" toggle so cards from the same repo
cluster together within a column, on top of whatever sort is already active.

**Design:** See `docs/superpowers/specs/2026-08-10-column-group-by-repo-design.md`.

**Architecture:** Keep the clustering itself a pure, unit-tested function
(`groupCardsByRepo`) alongside the existing `card-filter.ts` /
`card-navigation.ts` pure helpers. Apply it in `KanbanBoard.svelte`'s
`cardsForColumn`, right after the existing sort switch, so `KanbanColumn.svelte`
and keyboard navigation keep consuming a single pre-ordered `cards` array
exactly as they do for sort today. Track grouped columns in a `Set<ColumnId>`
that mirrors the existing `columnSorts` map.

**Tech Stack:** Svelte 5, TypeScript, Tailwind utility classes, Playwright, `bun:test`.

## Global Constraints

- Grouping is per-column, transient view state — do not persist it to board
  state or `BoardConfig`.
- Cluster order is alphabetical by repo full name; within a cluster, preserve
  whatever order the column's active sort (or drag order) already produced.
- Do not change `PRCard`, `ColumnDef`, or any persisted board-state shape.
- Do not touch the orphaned-cards (`__orphaned__`) column's props — it stays
  unwired, matching its existing lack of a sort control.
- Make minimal changes — do not refactor unrelated sort/copy/drag code.

---

### Task 1: Pure `groupCardsByRepo` helper

**Files:**

- Create: `apps/web/src/lib/card-grouping.ts`
- Create: `apps/web/src/lib/card-grouping.test.ts`

**Interfaces:**

- Produces: `groupCardsByRepo<T extends { repo: string }>(cards: T[]): T[]` —
  returns a new array clustered by `repo` (alphabetical by repo name),
  preserving each card's relative order within its cluster.

- [x] **Step 1: Write the failing unit tests**

  ```ts
  import { describe, expect, it } from "bun:test";
  import { groupCardsByRepo } from "./card-grouping";

  type Fake = { id: string; repo: string };
  const c = (id: string, repo: string): Fake => ({ id, repo });

  describe("groupCardsByRepo", () => {
    it("empty input stays empty", () => {
      expect(groupCardsByRepo([])).toEqual([]);
    });

    it("a single repo is unaffected", () => {
      const cards = [c("1", "a/one"), c("2", "a/one")];
      expect(groupCardsByRepo(cards)).toEqual(cards);
    });

    it("clusters interleaved repos, sorted alphabetically, order preserved within a cluster", () => {
      const cards = [c("1", "b/repo"), c("2", "a/repo"), c("3", "b/repo"), c("4", "a/repo")];
      expect(groupCardsByRepo(cards).map((x) => x.id)).toEqual(["2", "4", "1", "3"]);
    });

    it("does not mutate the input array", () => {
      const cards = [c("1", "b/repo"), c("2", "a/repo")];
      const copy = [...cards];
      groupCardsByRepo(cards);
      expect(cards).toEqual(copy);
    });
  });
  ```

- [x] **Step 2: Run the focused test and verify it fails**

  Run: `bun test apps/web/src/lib/card-grouping.test.ts`

  Expected: FAIL — `card-grouping.ts` does not exist yet.

- [x] **Step 3: Implement the helper**

  ```ts
  /**
   * Clusters cards by `repo`, ordering clusters alphabetically by repo full
   * name. Cards keep their relative order within their cluster — grouping
   * only clusters, it never re-sorts within a repo.
   */
  export function groupCardsByRepo<T extends { repo: string }>(cards: T[]): T[] {
    const order: string[] = [];
    const buckets = new Map<string, T[]>();
    for (const card of cards) {
      let bucket = buckets.get(card.repo);
      if (!bucket) {
        bucket = [];
        buckets.set(card.repo, bucket);
        order.push(card.repo);
      }
      bucket.push(card);
    }
    return [...order].sort((a, b) => a.localeCompare(b)).flatMap((repo) => buckets.get(repo)!);
  }
  ```

- [x] **Step 4: Run the focused test and verify it passes**

  Run: `bun test apps/web/src/lib/card-grouping.test.ts`

  Expected: PASS, all four cases.

- [x] **Step 5: Commit**

  ```bash
  git add apps/web/src/lib/card-grouping.ts apps/web/src/lib/card-grouping.test.ts
  git commit -m "feat: add pure groupCardsByRepo helper"
  ```

---

### Task 2: Wire grouping state into `KanbanBoard.svelte`

**Files:**

- Modify: `apps/web/src/components/KanbanBoard.svelte`

**Interfaces:**

- Consumes: `groupCardsByRepo` from `$lib/card-grouping`.
- Produces: `groupedColumns: Set<ColumnId>` state, `onToggleGroup(colId, grouped)`
  handler, and `grouped`/`onToggleGroup` props passed down to each real
  `KanbanColumn` (not the orphaned one).

- [x] **Step 1: Add grouped-column state next to `columnSorts`**

  ```ts
  let groupedColumns = $state<Set<ColumnId>>(new Set());

  function onToggleGroup(colId: ColumnId, grouped: boolean) {
    const next = new Set(groupedColumns);
    if (grouped) next.add(colId);
    else next.delete(colId);
    groupedColumns = next;
  }
  ```

- [x] **Step 2: Apply grouping in `cardsForColumn`, after the sort switch**

  Wrap the existing sorted result:

  ```ts
  function cardsForColumn(columnId: ColumnId): PRCard[] {
    const cols = filteredCards.filter((c) => c.columnId === columnId);
    const mode = columnSorts.get(columnId);
    const sorted = (() => {
      if (!mode || mode === "default") {
        return cols.sort((a, b) => a.order - b.order);
      }
      switch (mode) {
        case "pr-asc":
          return cols.sort((a, b) => a.prNumber - b.prNumber);
        case "pr-desc":
          return cols.sort((a, b) => b.prNumber - a.prNumber);
        case "age-asc":
          return cols.sort(
            (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
          );
        case "age-desc":
          return cols.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
      }
    })();
    return groupedColumns.has(columnId) ? groupCardsByRepo(sorted) : sorted;
  }
  ```

- [x] **Step 3: Skip reorder-by-order while a column is grouped**

  In `moveFocusedCard`, extend the existing sort guard:

  ```ts
  const mode = columnSorts.get(columnId);
  if ((mode && mode !== "default") || groupedColumns.has(columnId)) return;
  ```

  Apply the identical change in `moveFocusedCardToEdge`.

- [x] **Step 4: Pass `grouped`/`onToggleGroup` to each real column**

  In the `{#each columns as col (col.id)}` block's `<KanbanColumn>`:

  ```svelte
  grouped={groupedColumns.has(col.id)}
  onToggleGroup={(g) => onToggleGroup(col.id, g)}
  ```

  Leave the orphaned-cards `<KanbanColumn>` instance untouched (no grouping
  props), matching its existing lack of sort props.

- [x] **Step 5: Type-check**

  Run: `bun run check-types`

  Expected: fails only on the still-missing `grouped`/`onToggleGroup` props
  on `KanbanColumn` (Task 3 adds them) — everything else in this file passes.

- [x] **Step 6: Commit**

  ```bash
  git add apps/web/src/components/KanbanBoard.svelte
  git commit -m "feat: track per-column repo grouping in KanbanBoard"
  ```

---

### Task 3: `KanbanColumn.svelte` — toggle, status line, and cluster labels

**Files:**

- Modify: `apps/web/src/components/KanbanColumn.svelte`
- Modify: `apps/web/e2e/board.e2e.ts`

**Interfaces:**

- Consumes: `grouped?: boolean = false`, `onToggleGroup?: (grouped: boolean) => void = () => {}`.
- Produces: a **Group** section in the options panel with a **Group by repo**
  toggle button (`aria-pressed`); a status line combining the active sort and
  grouping state; a small label above each repo cluster's first visible card.

- [x] **Step 1: Write the failing browser test**

  Add inside the existing `Review365` describe block, after the "column
  options: sorting stays open" test:

  ```ts
  test("column options: group by repo clusters cards and can be turned off", async ({ page }) => {
    const REPO2 = "test/other-repo";
    await seedAuth(page, { enabledRepos: [REPO, REPO2] });
    await mockGitHub(page, {
      open: [ghItem(1, "Repo A first"), ghItem(2, "Repo A second")],
    });
    // A second, narrower route for REPO2, without touching the shared helper
    // (which only knows about REPO). The trailing `*` matters: the real
    // request carries a query string (`?state=open&per_page=100`), and an
    // exact-string route pattern with no wildcard won't match it — it'll
    // silently fall through to mockGitHub's catch-all and 404.
    await page.route(`https://api.github.com/repos/${REPO2}/pulls*`, async (route) => {
      await route.fulfill({
        json: [
          {
            number: 1,
            title: "Repo B first",
            html_url: `https://github.com/${REPO2}/pull/1`,
            updated_at: new Date().toISOString(),
            user: { login: "someone" },
            draft: false,
            requested_reviewers: [],
            head: { sha: "sha-other-1" },
          },
        ],
      });
    });

    await page.goto("/", { waitUntil: "networkidle" });
    const inboxColumn = page.getByRole("region", { name: "📥 Inbox" });
    const orderOf = () =>
      inboxColumn
        .locator("[data-card-id]")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

    await expect.poll(() => orderOf().then((ids) => ids.length)).toBe(3);

    await inboxColumn.getByRole("button", { name: "📥 Inbox column options" }).click();
    const panel = inboxColumn.getByRole("dialog");
    await panel.getByRole("button", { name: "Group by repo" }).click();

    // Cluster labels combine repo + count; plain repo text alone also
    // appears inside every card, so match the combined label to stay strict.
    await expect(inboxColumn.getByText(`${REPO} · 2`)).toBeVisible();
    await expect(inboxColumn.getByText(`${REPO2} · 1`)).toBeVisible();
    // Card ids: `pr_${repo.replaceAll("/", "_")}_${number}` (only `/` is
    // replaced), so "test/other-repo" PR #1 is "pr_test_other-repo_1".
    // "test/other-repo" sorts before "test/repo" ('o' < 'r').
    await expect
      .poll(orderOf)
      .toEqual(["pr_test_other-repo_1", "pr_test_repo_1", "pr_test_repo_2"]);

    await page.keyboard.press("Escape");
    await expect(inboxColumn.getByText("Grouped by repo")).toBeVisible();

    await inboxColumn.getByRole("button", { name: "📥 Inbox column options" }).click();
    await panel.getByRole("button", { name: "Group by repo" }).click();
    await expect(inboxColumn.getByText("Grouped by repo")).toBeHidden();
  });
  ```

- [x] **Step 2: Run the focused test and verify it fails**

  Run: `bunx playwright test apps/web/e2e/board.e2e.ts --grep "group by repo"`

  Expected: FAIL — no "Group by repo" control exists in `KanbanColumn.svelte` yet.

- [x] **Step 3: Add the new props**

  ```ts
  let {
    // ...existing props
    grouped = false,
    onToggleGroup = () => {},
  }: {
    // ...existing prop types
    grouped?: boolean;
    onToggleGroup?: (grouped: boolean) => void;
  } = $props();
  ```

- [x] **Step 4: Extend the header status line**

  Replace the existing `{:else if sortMode !== 'default'}` branch with one
  that reports both sort and grouping when either is active:

  ```svelte
  {:else if sortMode !== 'default' || grouped}
    <span class="block truncate text-[11px] text-blue-600 dark:text-blue-400">
      {[sortMode !== 'default' ? `Sorted by ${activeSort.label}` : null, grouped ? 'Grouped by repo' : null]
        .filter(Boolean)
        .join(' · ')}
    </span>
  {/if}
  ```

- [x] **Step 5: Add the Group section to the options panel**

  After the existing Sort grid (`</div>` closing the `grid-cols-2` block) and
  before the `<div class="my-3 h-px ...">` separator, insert:

  ```svelte
  <div class="mb-2 mt-3 flex items-center justify-between">
    <span class="text-[11px] font-semibold uppercase tracking-wide text-faint">Group</span>
  </div>
  <button
    type="button"
    aria-pressed={grouped}
    onclick={() => onToggleGroup(!grouped)}
    class="flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors {grouped
      ? 'border-blue-500 bg-blue-600 text-white'
      : 'border-control text-body hover-surface'}"
  >
    <span aria-hidden="true" class="w-4 shrink-0 text-center">📦</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate font-medium">Group by repo</span>
      <span class="block truncate text-[10px] {grouped ? 'text-blue-100' : 'text-faint'}">
        cluster cards by repo
      </span>
    </span>
  </button>
  ```

- [x] **Step 6: Render a repo label above each cluster's first card**

  Change the card loop to track index and the previous card's repo:

  ```svelte
  {#each visibleCards as card, i (card.id)}
    <div role="listitem" animate:flip={{ duration: 300 }}>
      {#if grouped && (i === 0 || visibleCards[i - 1].repo !== card.repo)}
        <div class="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <span class="truncate">{card.repo}</span>
          <span class="shrink-0 normal-case tracking-normal">
            · {visibleCards.filter((c) => c.repo === card.repo).length}
          </span>
        </div>
      {/if}
      {#if dropTargetId === card.id && dropAbove && card.id !== cardDrag.cardId}
        ...
  ```

  (Leave the rest of the existing per-card block — drop slots, `KanbanCard`,
  closing tags — unchanged.)

- [x] **Step 7: Run the focused test and verify it passes**

  Run: `bunx playwright test apps/web/e2e/board.e2e.ts --grep "group by repo"`

  Expected: PASS.

- [x] **Step 8: Run the full suite**

  Run: `bun run check && bunx playwright test apps/web/e2e/board.e2e.ts`

  Expected: exit code 0, no regressions in unrelated tests.

- [x] **Step 9: Commit**

  ```bash
  git add apps/web/src/components/KanbanColumn.svelte apps/web/e2e/board.e2e.ts
  git commit -m "feat: add group-by-repo toggle and cluster labels to KanbanColumn"
  ```

---

### Task 4: Update project docs

**Files:**

- Modify: `CONTEXT.md` (only if it documents per-column view options —
  currently it does not, so this task may be a no-op; confirm before editing).

- [x] **Step 1: Check whether `CONTEXT.md` needs an update**

  Grep for "Sort" or "sortMode" language in `CONTEXT.md`. If column-level
  view options aren't documented there today, skip this task rather than
  introducing new documentation scope.

- [x] **Step 2: Final check and push**

  ```bash
  bun run check
  git push -u origin claude/group-cards-by-repo-iynctk
  ```
