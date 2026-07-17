import { test, expect, type Page } from "@playwright/test";

const REPO = "test/repo";

interface GHItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  user: { login: string };
  draft: boolean;
  requested_reviewers?: { login: string }[];
  head: { sha: string };
}

interface GHCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

function ghItem(
  n: number,
  title: string,
  opts: { draft?: boolean; author?: string; reviewer?: string } = {},
): GHItem {
  return {
    number: n,
    title,
    html_url: `https://github.com/${REPO}/pull/${n}`,
    updated_at: new Date().toISOString(),
    user: { login: opts.author ?? "someone" },
    draft: opts.draft ?? false,
    requested_reviewers: opts.reviewer ? [{ login: opts.reviewer }] : [],
    head: { sha: `sha-${n}` },
  };
}

async function seedAuth(page: Page, opts: { enabledRepos?: string[] } = {}) {
  await page.addInitScript((repos) => {
    localStorage.setItem("review365:token", "test-token");
    localStorage.setItem("review365:login", "testuser");
    localStorage.setItem("review365:board", JSON.stringify({ cards: {}, enabledRepos: repos }));
  }, opts.enabledRepos ?? []);
}

async function mockGitHub(
  page: Page,
  opts: { open?: GHItem[]; merged?: GHItem[]; checkRuns?: GHCheckRun[] } = {},
) {
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === `/repos/${REPO}/pulls`) {
      await route.fulfill({ json: opts.open ?? [] });
      return;
    }
    if (url.pathname === "/search/issues") {
      const q = url.searchParams.get("q") ?? "";
      const items = q.includes("is:merged") ? (opts.merged ?? []) : [];
      await route.fulfill({ json: { total_count: items.length, items } });
      return;
    }
    if (/^\/repos\/.+\/pulls\/\d+\/reviews$/.test(url.pathname)) {
      await route.fulfill({ json: [] });
      return;
    }
    if (/^\/repos\/.+\/commits\/.+\/check-runs$/.test(url.pathname)) {
      await route.fulfill({ json: { check_runs: opts.checkRuns ?? [] } });
      return;
    }
    if (url.pathname === "/user/repos") {
      await route.fulfill({
        json: [{ full_name: REPO, archived: false }],
      });
      return;
    }
    if (/^\/orgs\/.+\/repos$/.test(url.pathname)) {
      await route.fulfill({ json: [] });
      return;
    }
    if (/^\/users\/.+\/orgs$/.test(url.pathname)) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname === "/user") {
      await route.fulfill({ json: { login: "testuser" } });
      return;
    }
    await route.fulfill({ status: 404, json: { message: "not mocked" } });
  });
}

test.describe("Review365", () => {
  test("CI panel: closes after the pointer leaves the panel", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "Check panel")],
      checkRuns: [{ name: "lint", status: "completed", conclusion: "failure" }],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    const ciButton = page.getByRole("button", { name: "1 checks failed" });
    await expect(ciButton).toBeVisible({ timeout: 5000 });

    await ciButton.hover();
    const panel = page.getByRole("dialog", { name: "CI checks" });
    await expect(panel).toBeVisible();
    await panel.hover();
    await page.mouse.move(0, 0);
    await expect(panel).toBeHidden();
  });

  test("onboarding: gate shows without token, connecting reveals board", async ({ page }) => {
    await mockGitHub(page);
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).not.toBeVisible();
    await expect(page.locator("#token-input")).not.toBeVisible();

    await page.getByRole("link", { name: "Connect account" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("h1")).toContainText("Connect your account");
    await expect(page.getByRole("button", { name: "Connect with GitHub" })).toBeVisible();

    await page.getByRole("button", { name: "Use a personal access token instead" }).click();
    await page.locator("#token-input").fill("ghp_testtoken");
    await page.getByRole("button", { name: "Connect account" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible({ timeout: 5000 });
  });

  test("oauth callback: stores token from hash and opens board", async ({ page }) => {
    await mockGitHub(page);
    await page.goto("/settings/oauth#access_token=oauth-test-token");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible({ timeout: 5000 });

    const stored = await page.evaluate(() => ({
      token: localStorage.getItem("review365:token"),
      login: localStorage.getItem("review365:login"),
    }));
    expect(stored).toEqual({ token: "oauth-test-token", login: "testuser" });
  });

  test("oauth callback: shows error from query string", async ({ page }) => {
    await page.goto("/settings/oauth?error=access_denied");
    await expect(page.locator("h1")).toContainText("Could not connect");
    await expect(page.getByText(/authorization was cancelled/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to connect" })).toBeVisible();
  });

  test("page loads with title and toolbar", async ({ page }) => {
    await seedAuth(page);
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  test("activity: opens an empty board-wide log", async ({ page }) => {
    await seedAuth(page);
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Activity" })).toBeVisible();
    await expect(page.getByText("No activity yet")).toBeVisible();
  });

  test("activity: records a note change and can clear the active platform history", async ({
    page,
  }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, { open: [ghItem(14, "Activity test PR")] });
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Add note..." }).click();
    await page.locator("input[maxlength='200']").fill("Remember to review this");
    await page.locator("input[maxlength='200']").press("Enter");

    await page.getByRole("button", { name: "Activity", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Activity" });
    await expect(panel.getByText("test/repo #14")).toBeVisible();
    await expect(panel.getByText("Activity test PR")).toBeVisible();
    await expect(panel.getByText("got a note")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await panel.getByRole("button", { name: "Clear" }).click();
    await expect(panel.getByText("No activity yet")).toBeVisible();
  });

  test("settings panel opens and shows inputs", async ({ page }) => {
    await seedAuth(page);
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await page.locator("button", { hasText: "Settings" }).click();
    await page.getByPlaceholder("New column title...").waitFor({ state: "visible", timeout: 5000 });
    await expect(page.getByText("Merged PR retention")).toBeVisible();
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByText("@testuser")).toBeVisible();
  });

  test("adds and deletes a column", async ({ page }) => {
    await seedAuth(page);
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await page.locator("button", { hasText: "Settings" }).click();
    await page.getByPlaceholder("New column title...").waitFor({ state: "visible", timeout: 5000 });

    // Use a unique name to avoid conflicts with leftover state from previous runs
    const colName = `E2ETest-${Date.now()}`;

    // Add column via settings panel
    await page.getByPlaceholder("New column title...").fill(colName);
    await page.getByPlaceholder("New column title...").press("Enter");

    // Column title should appear as a span in the settings column list (flex-1 class distinguishes it from board header)
    const titleSpan = page.locator("span.flex-1", { hasText: colName });
    await expect(titleSpan).toBeVisible({ timeout: 3000 });

    // Delete: find the container div and click its Delete button
    const container = titleSpan.locator("..");
    await container.getByRole("button", { name: "Delete" }).click();
    await expect(titleSpan).not.toBeVisible({ timeout: 3000 });
  });

  test("note: adds and edits a note on a card", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, { open: [ghItem(1, "Test PR")] });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });

    // Card loads from the mocked GitHub API on mount
    await expect(page.locator(`text=${REPO}`)).toBeVisible({ timeout: 5000 });

    // Click "Add note..." to start editing
    const addNoteBtn = page.getByRole("button", { name: "Add note..." }).first();
    await expect(addNoteBtn).toBeVisible({ timeout: 3000 });
    await addNoteBtn.click();

    // The input should appear
    const noteInput = page.locator("input[maxlength='200']");
    await expect(noteInput).toBeVisible();

    // Type a note and save
    await noteInput.fill("Review the error handling");
    await noteInput.press("Enter");

    // Verify the note appears on the card
    await expect(page.getByRole("button", { name: "Review the error handling" })).toBeVisible();

    // Verify the note was persisted to localStorage
    const savedNote = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("review365:board") ?? "{}");
      return state.cards?.["pr_test_repo_1"]?.note;
    });
    expect(savedNote).toBe("Review the error handling");

    // Click the note to edit again
    await page.getByRole("button", { name: "Review the error handling" }).click();
    const noteInput2 = page.locator("input[maxlength='200']");
    await expect(noteInput2).toBeVisible();
    await expect(noteInput2).toHaveValue("Review the error handling");

    // Clear the note
    await noteInput2.fill("");
    await noteInput2.press("Enter");

    // "Add note..." placeholder should be back
    await expect(page.getByRole("button", { name: "Add note..." }).first()).toBeVisible();
  });

  test("note: input is not draggable", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, { open: [ghItem(1, "Test PR")] });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.locator(`text=${REPO}`)).toBeVisible({ timeout: 5000 });

    // Open note editing
    await page.getByRole("button", { name: "Add note..." }).first().click();
    const noteInput = page.locator("input[maxlength='200']");
    await expect(noteInput).toBeVisible();

    // Verify the input has draggable="false"
    expect(await noteInput.getAttribute("draggable")).toBe("false");

    // Simulate mousedown+drag on the input, then verify card is NOT in dragging state
    const inputBox = await noteInput.boundingBox();
    if (inputBox) {
      const startX = inputBox.x + inputBox.width / 2;
      const startY = inputBox.y + inputBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 50, startY + 50, { steps: 5 });

      // The card should NOT have the .dragging class
      const draggingCount = await page.locator(".dragging").count();
      expect(draggingCount).toBe(0);

      await page.mouse.up();
    }
  });

  test("repo filter: adding a repo fetches its PRs immediately", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [] });
    await mockGitHub(page, { open: [ghItem(1, "Fresh PR")] });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });

    await page.getByRole("button", { name: /Repos \(0\)/ }).click();
    await page.getByPlaceholder("Type to search your repos...").fill("test");
    await expect(page.getByText(REPO)).toBeVisible({ timeout: 3000 });
    await page.getByText(REPO).click();

    await expect(page.getByText("Fresh PR")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Repos \(1\)/ })).toBeVisible();
  });

  test("keyboard: arrows move focus between cards and Enter opens the PR", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, { open: [ghItem(1, "First PR"), ghItem(2, "Second PR")] });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.getByText("First PR")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Second PR")).toBeVisible();

    const focusedId = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-card-id") ?? null);

    // Entry: first arrow focuses the first card in the first non-empty column.
    await page.keyboard.press("ArrowDown");
    const id1 = await focusedId();
    expect(id1).not.toBeNull();

    // Down moves to the next card, up returns.
    await page.keyboard.press("ArrowDown");
    const id2 = await focusedId();
    expect(id2).not.toBeNull();
    expect(id2).not.toBe(id1);

    await page.keyboard.press("ArrowUp");
    expect(await focusedId()).toBe(id1);

    // Enter opens the focused PR in a new tab.
    const popup = await Promise.all([
      page.waitForEvent("popup"),
      page.keyboard.press("Enter"),
    ]).then(([p]) => p);
    expect(popup.url()).toContain(`/${REPO}/pull/`);
  });

  test("keyboard: clicking a card makes it the selection", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "First PR"), ghItem(2, "Second PR"), ghItem(3, "Third PR")],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.getByText("Third PR")).toBeVisible({ timeout: 5000 });

    const focusedId = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-card-id") ?? null);
    const order = await page
      .getByRole("region", { name: "📥 Inbox" })
      .locator("[data-card-id]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

    // Clicking the middle card selects it; keyboard nav then continues from there.
    await page.getByText("Second PR").click();
    expect(await focusedId()).toBe(order[1]);
    await page.keyboard.press("ArrowUp");
    expect(await focusedId()).toBe(order[0]);
  });

  test("keyboard: Shift+Arrow moves a card and note editing suspends navigation", async ({
    page,
  }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, { open: [ghItem(1, "Movable PR")] });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.getByText("Movable PR")).toBeVisible({ timeout: 5000 });

    const focusedId = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-card-id") ?? null);

    // Focus the card, then shift it to the adjacent column.
    await page.keyboard.press("ArrowDown");
    const id = await focusedId();
    expect(id).not.toBeNull();

    await page.keyboard.press("Shift+ArrowRight");
    // Card now lives in the next column, and keeps focus.
    await expect(
      page.getByRole("region", { name: "👀 Reviewing" }).getByText("Movable PR"),
    ).toBeVisible({ timeout: 3000 });
    expect(await focusedId()).toBe(id);

    // Start editing the note; navigation keys must not steal focus from the input.
    await page.keyboard.press("n");
    const noteInput = page.locator("input[maxlength='200']");
    await expect(noteInput).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(noteInput).toBeFocused();
    expect(await focusedId()).toBeNull();
  });

  test("keyboard: Ctrl/Cmd+Up/Down jump to and move cards to column edges", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "Alpha PR"), ghItem(2, "Beta PR"), ghItem(3, "Gamma PR")],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.getByText("Gamma PR")).toBeVisible({ timeout: 5000 });

    const focusedId = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-card-id") ?? null);
    const columnOrder = () =>
      page
        .getByRole("region", { name: "📥 Inbox" })
        .locator("[data-card-id]")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

    await page.keyboard.press("ArrowDown");
    const order = await columnOrder();
    expect(order.length).toBe(3);

    // Jump to the bottom, then back to the top.
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    expect(await focusedId()).toBe(order[2]);
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    expect(await focusedId()).toBe(order[0]);

    // Move the (topmost) focused card to the bottom; focus follows it.
    await page.keyboard.press("ControlOrMeta+Shift+ArrowDown");
    await expect.poll(async () => (await columnOrder()).at(-1)).toBe(order[0]);
    expect(await focusedId()).toBe(order[0]);
  });

  test("keyboard: jumping/moving to a column edge scrolls the card into view", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    // Enough cards that the column overflows and must scroll.
    await mockGitHub(page, {
      open: Array.from({ length: 20 }, (_, i) => ghItem(i + 1, `PR number ${i + 1}`)),
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.locator("[data-card-id]")).toHaveCount(20, { timeout: 5000 });

    // scrollTop of the column that holds the focused card.
    const scrollTop = () =>
      page.evaluate(
        () =>
          (document.activeElement as HTMLElement | null)?.closest(".column-body")?.scrollTop ?? -1,
      );
    // The focused card sits within its column's visible scroll viewport.
    const focusedInView = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const c = el?.closest(".column-body");
        if (!el?.dataset.cardId || !c) return false;
        const cr = c.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.top >= cr.top - 2 && r.bottom <= cr.bottom + 2;
      });

    // Focus the top card, jump to the bottom → column scrolls down and the card is visible.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await expect.poll(scrollTop).toBeGreaterThan(0);
    await expect.poll(focusedInView).toBe(true);
    const bottom = await scrollTop();

    // Jump back to the top → scrolls back up.
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    await expect.poll(scrollTop).toBeLessThan(bottom);

    // Moving the top card to the bottom scrolls the moved card into view.
    await page.keyboard.press("ControlOrMeta+Shift+ArrowDown");
    await expect.poll(scrollTop).toBeGreaterThan(0);
    await expect.poll(focusedInView).toBe(true);
  });

  test("keyboard: moving a card to another column and back restores its position", async ({
    page,
  }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "One PR"), ghItem(2, "Two PR"), ghItem(3, "Three PR")],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await expect(page.getByText("Three PR")).toBeVisible({ timeout: 5000 });

    const focusedId = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-card-id") ?? null);
    const orderOf = (name: string) =>
      page
        .getByRole("region", { name })
        .locator("[data-card-id]")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

    const inboxBefore = await orderOf("📥 Inbox");
    expect(inboxBefore.length).toBe(3);

    // Focus the middle card.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const middle = await focusedId();
    expect(middle).toBe(inboxBefore[1]);

    // Move it to the next column, then straight back.
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(() => orderOf("👀 Reviewing")).toContain(middle);
    await page.keyboard.press("Shift+ArrowLeft");

    // Inbox order is restored and the card keeps focus.
    await expect.poll(() => orderOf("📥 Inbox")).toEqual(inboxBefore);
    expect(await focusedId()).toBe(middle);
  });

  test("column list: copies visible cards as a Markdown list", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page, {
      open: [ghItem(1, "First PR"), ghItem(2, "Second PR")],
    });

    await page.goto("/", { waitUntil: "networkidle" });
    const inboxColumn = page.getByRole("region", { name: "📥 Inbox" });
    await inboxColumn.getByRole("button", { name: "Column actions" }).click();
    await inboxColumn.getByRole("button", { name: "Copy list" }).click();

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        "- [test/repo#1](https://github.com/test/repo/pull/1) - First PR\n" +
          "- [test/repo#2](https://github.com/test/repo/pull/2) - Second PR",
      );
  });

  test("export excludes token, import restores board", async ({ page }) => {
    await seedAuth(page, { enabledRepos: [REPO] });
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("button", { hasText: "Settings" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export board" }).click();
    const download = await downloadPromise;
    const content = await (await download.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(content).toString());

    expect(json.board.enabledRepos).toEqual([REPO]);
    expect(json.config.columns.length).toBeGreaterThan(0);
    expect(JSON.stringify(json)).not.toContain("test-token");
  });
});
