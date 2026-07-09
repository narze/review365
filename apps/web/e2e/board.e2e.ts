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
  };
}

async function seedAuth(page: Page, opts: { enabledRepos?: string[] } = {}) {
  await page.addInitScript((repos) => {
    localStorage.setItem("review365:token", "test-token");
    localStorage.setItem("review365:login", "testuser");
    localStorage.setItem("review365:board", JSON.stringify({ cards: {}, enabledRepos: repos }));
  }, opts.enabledRepos ?? []);
}

async function mockGitHub(page: Page, opts: { open?: GHItem[]; merged?: GHItem[] } = {}) {
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === `/repos/${REPO}/pulls`) {
      await route.fulfill({ json: opts.open ?? [] });
      return;
    }
    if (url.pathname === "/search/issues") {
      const q = url.searchParams.get("q") ?? "";
      const items = q.includes("is:merged") ? opts.merged ?? [] : [];
      await route.fulfill({ json: { total_count: items.length, items } });
      return;
    }
    if (/^\/repos\/.+\/pulls\/\d+\/reviews$/.test(url.pathname)) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname === "/search/repositories") {
      await route.fulfill({
        json: { total_count: 1, items: [{ full_name: REPO, archived: false }] },
      });
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
  test("onboarding: gate shows without token, connecting reveals board", async ({ page }) => {
    await mockGitHub(page);
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).not.toBeVisible();
    await expect(page.locator("#token-input")).not.toBeVisible();

    await page.getByRole("link", { name: "Connect account" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("h1")).toContainText("Connect your account");

    await page.locator("#token-input").fill("ghp_testtoken");
    await page.getByRole("button", { name: "Connect account" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible({ timeout: 5000 });
  });

  test("page loads with title and toolbar", async ({ page }) => {
    await seedAuth(page);
    await mockGitHub(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
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
