import { test, expect } from "@playwright/test";

test.describe("Review365", () => {
  test("page loads with title and toolbar", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("Review365");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  test("settings panel opens and shows inputs", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });
    await page.locator("button", { hasText: "Settings" }).click();
    await page.getByPlaceholder("New column title...").waitFor({ state: "visible", timeout: 5000 });
    await expect(page.getByText("Merged PR retention")).toBeVisible();
  });

  test("adds and deletes a column", async ({ page }) => {
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
    // Mock the prs/list RPC to return a card
    await page.route("**/rpc/prs/list", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            columns: [{ id: "inbox", title: "Inbox" }],
            cards: [
              {
                id: "pr_test_repo_1",
                prNumber: 1,
                repo: "test/repo",
                title: "Test PR",
                author: "testuser",
                url: "https://github.com/test/repo/pull/1",
                updatedAt: new Date().toISOString(),
                isOwnPR: false,
                columnId: "inbox",
                signals: ["pr-open"],
                archived: false,
                order: 1,
              },
            ],
            enabledRepos: ["test/repo"],
            rules: [],
            orphans: [],
            signalLabels: { "pr-open": "PR Open" },
            mergedRetentionDays: 14,
          },
        }),
      });
    });

    // Mock the board/updateNote RPC
    let savedNote = "";
    await page.route("**/rpc/board/updateNote", async (route) => {
      const body = route.request().postDataJSON();
      savedNote = body.json.note;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });

    // Click Refresh to trigger a client-side fetch (will use our mock)
    await page.locator("button", { hasText: "Refresh" }).click();

    // Verify the card is visible
    await expect(page.locator("text=test/repo")).toBeVisible({ timeout: 5000 });

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

    // Verify the updateNote RPC was called
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
    // Mock the prs/list RPC to return a card
    await page.route("**/rpc/prs/list", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            columns: [{ id: "inbox", title: "Inbox" }],
            cards: [
              {
                id: "pr_test_repo_1",
                prNumber: 1,
                repo: "test/repo",
                title: "Test PR",
                author: "testuser",
                url: "https://github.com/test/repo/pull/1",
                updatedAt: new Date().toISOString(),
                isOwnPR: false,
                columnId: "inbox",
                signals: [],
                archived: false,
                order: 1,
              },
            ],
            enabledRepos: ["test/repo"],
            rules: [],
            orphans: [],
            signalLabels: {},
            mergedRetentionDays: 14,
          },
        }),
      });
    });

    // Mock the board/updateNote RPC
    await page.route("**/rpc/board/updateNote", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });

    // Click Refresh to load mocked data client-side
    await page.locator("button", { hasText: "Refresh" }).click();
    await expect(page.locator("text=test/repo")).toBeVisible({ timeout: 5000 });

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
});
