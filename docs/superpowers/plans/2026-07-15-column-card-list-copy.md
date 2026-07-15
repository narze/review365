# Column Card List Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-column actions menu that copies the visible PR cards to the clipboard as a Markdown list.

**Architecture:** Keep filtering, list formatting, clipboard writing, and status feedback in `KanbanColumn.svelte`, where the displayed card order is already represented by `visibleCards`. Add a browser-level Playwright test so the copied result is validated from the user action through the Clipboard API.

**Tech Stack:** Svelte 5, TypeScript, Tailwind utility classes, Playwright.

## Global Constraints

- Copy only `visibleCards`, preserving their current on-screen order.
- Each item is `- [repo#number — title](url)`.
- Include archived cards only when `showArchived` is enabled.
- Do not modify cards, their order, or unrelated pending workspace changes.

---

### Task 1: Copy a visible column as Markdown

**Files:**

- Modify: `apps/web/src/components/KanbanColumn.svelte:60-80, header markup`
- Test: `apps/web/e2e/board.e2e.ts`

**Interfaces:**

- Consumes: `visibleCards: PRCard[]`, with `repo`, `prNumber`, `title`, and `url` fields.
- Produces: a `⋯` actions button with a `Copy list` menu item that calls `navigator.clipboard.writeText(markdown)`.

- [ ] **Step 1: Write the failing browser test**

  Add this test inside the existing `Review365` describe block:

  ```ts
  test("column list: copies visible cards as a Markdown list", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "First PR"), ghItem(2, "Second PR")],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Copy list" }).first().click();

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        "- [test/repo#1 — First PR](https://github.com/test/repo/pull/1)\\n" +
          "- [test/repo#2 — Second PR](https://github.com/test/repo/pull/2)",
      );
  });
  ```

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `bunx playwright test apps/web/e2e/board.e2e.ts --grep "column list"`

  Expected: FAIL because no button named `Copy list` exists.

- [ ] **Step 3: Add the smallest component implementation**

  In `KanbanColumn.svelte`, define transient status and a copy handler after `visibleCards`:

  ```ts
  let copyStatus = $state<"idle" | "copied" | "failed">("idle");
  let copyStatusTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyVisibleCards() {
    const markdown = visibleCards
      .map((card) => `- [${card.repo}#${card.prNumber} — ${card.title}](${card.url})`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(markdown);
      copyStatus = "copied";
    } catch {
      copyStatus = "failed";
    }

    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    copyStatusTimer = setTimeout(() => (copyStatus = "idle"), 2000);
  }
  ```

  Place a `type="button"` control beside the existing header controls:

  ```svelte
  <button
    type="button"
    class="..."
    aria-label={copyStatus === 'copied' ? 'List copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy list'}
    title={copyStatus === 'copied' ? 'List copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy list'}
    onclick={copyVisibleCards}
  >
    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy list'}
  </button>
  ```

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `bunx playwright test apps/web/e2e/board.e2e.ts --grep "column list"`

  Expected: PASS with the exact two-line Markdown clipboard value.

- [ ] **Step 5: Run relevant static checks**

  Run: `bun run check`

  Expected: exit code 0 with no TypeScript, Svelte, lint, or formatting errors introduced by this feature.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add apps/web/src/components/KanbanColumn.svelte apps/web/e2e/board.e2e.ts
  git commit -m "feat: copy column cards as a list"
  ```
