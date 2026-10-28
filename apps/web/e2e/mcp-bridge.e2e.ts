import { test, expect, type Page } from "@playwright/test";
import { startBridgeServer, type BridgeServer } from "../../../packages/mcp/src/bridge-server";

const REPO = "test/repo";
const ORIGIN = "http://localhost:5173";

function ghItem(n: number, title: string) {
  return {
    number: n,
    title,
    html_url: `https://github.com/${REPO}/pull/${n}`,
    updated_at: new Date().toISOString(),
    user: { login: "someone" },
    draft: false,
    requested_reviewers: [],
    head: { sha: `sha-${n}` },
  };
}

async function seed(page: Page, bridge: { enabled: boolean; port: number } | null) {
  await page.addInitScript(
    ({ repo, bridge }) => {
      localStorage.setItem("review365:token", "test-token");
      localStorage.setItem("review365:login", "testuser");
      localStorage.setItem("review365:board", JSON.stringify({ cards: {}, enabledRepos: [repo] }));
      if (bridge) localStorage.setItem("review365:mcp-bridge", JSON.stringify(bridge));
    },
    { repo: REPO, bridge },
  );
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/repos/${REPO}/pulls`) {
      await route.fulfill({ json: [ghItem(1, "One PR"), ghItem(2, "Two PR")] });
    } else if (url.pathname === "/search/issues") {
      await route.fulfill({ json: { total_count: 0, items: [] } });
    } else if (url.pathname.endsWith("/check-runs")) {
      await route.fulfill({ json: { check_runs: [] } });
    } else {
      await route.fulfill({ json: [] });
    }
  });
}

const cardIdsIn = (page: Page, column: string) =>
  page
    .getByRole("region", { name: column })
    .locator("[data-card-id]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

test.describe("MCP bridge", () => {
  let bridge: BridgeServer;

  test.beforeEach(async () => {
    bridge = await startBridgeServer({ port: 0, allowedOrigins: [ORIGIN] });
  });

  test.afterEach(async () => {
    await bridge.close();
  });

  test("an agent reads the board and moves, notes and archives cards", async ({ page }) => {
    await seed(page, { enabled: true, port: bridge.port });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => bridge.isConnected()).toBe(true);

    const board = (await bridge.call("get_board", {})) as {
      columns: { id: string; cards: { id: string; title: string }[] }[];
    };
    const inbox = board.columns.find((c) => c.id === "inbox");
    expect(inbox?.cards.map((c) => c.title).sort()).toEqual(["One PR", "Two PR"]);

    await bridge.call("move_card", { card_id: "pr_test_repo_1", column_id: "reviewing" });
    await expect.poll(() => cardIdsIn(page, "👀 Reviewing")).toEqual(["pr_test_repo_1"]);

    await bridge.call("move_card", {
      card_id: "pr_test_repo_2",
      column_id: "reviewing",
      before_card_id: "pr_test_repo_1",
    });
    await expect
      .poll(() => cardIdsIn(page, "👀 Reviewing"))
      .toEqual(["pr_test_repo_2", "pr_test_repo_1"]);

    await bridge.call("set_note", { card_id: "pr_test_repo_1", note: "Ping author" });
    await expect(page.getByRole("button", { name: "Ping author" })).toBeVisible();

    await bridge.call("archive_card", { card_id: "pr_test_repo_2" });
    await expect.poll(() => cardIdsIn(page, "👀 Reviewing")).toEqual(["pr_test_repo_1"]);

    // Edits land in localStorage like a manual edit. (A reload would re-run the seed script.)
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem("review365:board") ?? "{}").cards,
    );
    expect(saved.pr_test_repo_1).toMatchObject({ column: "reviewing", note: "Ping author" });
    expect(saved.pr_test_repo_2).toMatchObject({ column: "reviewing", archived: true });
  });

  test("an invalid call returns an error and changes nothing", async ({ page }) => {
    await seed(page, { enabled: true, port: bridge.port });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => bridge.isConnected()).toBe(true);

    await expect(
      bridge.call("move_card", { card_id: "pr_test_repo_1", column_id: "nope" }),
    ).rejects.toThrow("Unknown column: nope");
    expect((await cardIdsIn(page, "📥 Inbox")).length).toBe(2);
  });

  test("the bridge is off by default and toggles from Settings", async ({ page }) => {
    await seed(page, null);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    expect(bridge.isConnected()).toBe(false);

    // The default port is not the test bridge's port, so point the tab at it first.
    await page.evaluate(
      (port) =>
        localStorage.setItem("review365:mcp-bridge", JSON.stringify({ enabled: false, port })),
      bridge.port,
    );
    await page.locator("button", { hasText: "Settings" }).click();
    const toggle = page.getByRole("checkbox", { name: "Connect to local MCP server" });
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    await expect.poll(() => bridge.isConnected()).toBe(true);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();

    await toggle.uncheck();
    await expect.poll(() => bridge.isConnected()).toBe(false);
    await expect(page.getByText("Connected", { exact: true })).toBeHidden();
  });
});
