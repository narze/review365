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
});
