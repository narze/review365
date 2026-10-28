import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const REPO = "test/repo";

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

/** A fresh token per test, so tests never reach each other's tabs through the relay. */
function newToken() {
  return `e2e-${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

async function seed(page: Page, bridge: { enabled: boolean; token: string } | null) {
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

/** Calls a tool on the MCP endpoint the way an HTTP MCP client does. */
async function mcpCall(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string }> {
  const res = await request.post("/api/mcp", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  return { isError: !!body.result.isError, text: body.result.content.map((c) => c.text).join("") };
}

/** The tab connects in the background; wait until the relay reaches it. */
async function waitForTab(request: APIRequestContext, token: string) {
  await expect
    .poll(async () => (await mcpCall(request, token, "get_board")).isError, { timeout: 10_000 })
    .toBe(false);
}

const cardIdsIn = (page: Page, column: string) =>
  page
    .getByRole("region", { name: column })
    .locator("[data-card-id]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId ?? null));

test.describe("MCP relay", () => {
  test("rejects MCP calls without a pairing token", async ({ request }) => {
    const res = await request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(res.status()).toBe(401);
  });

  test("an agent reads the board and moves, notes and archives cards", async ({
    page,
    request,
  }) => {
    const token = newToken();
    await seed(page, { enabled: true, token });
    // The open command stream keeps the network busy, so never wait for networkidle.
    await page.goto("/");
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    await waitForTab(request, token);

    const board = JSON.parse((await mcpCall(request, token, "get_board")).text) as {
      columns: { id: string; cards: { title: string }[] }[];
    };
    const inbox = board.columns.find((c) => c.id === "inbox");
    expect(inbox?.cards.map((c) => c.title).sort()).toEqual(["One PR", "Two PR"]);

    await mcpCall(request, token, "move_card", {
      card_id: "pr_test_repo_1",
      column_id: "reviewing",
    });
    await expect.poll(() => cardIdsIn(page, "👀 Reviewing")).toEqual(["pr_test_repo_1"]);

    await mcpCall(request, token, "move_card", {
      card_id: "pr_test_repo_2",
      column_id: "reviewing",
      before_card_id: "pr_test_repo_1",
    });
    await expect
      .poll(() => cardIdsIn(page, "👀 Reviewing"))
      .toEqual(["pr_test_repo_2", "pr_test_repo_1"]);

    await mcpCall(request, token, "set_note", { card_id: "pr_test_repo_1", note: "Ping author" });
    await expect(page.getByRole("button", { name: "Ping author" })).toBeVisible();

    await mcpCall(request, token, "archive_card", { card_id: "pr_test_repo_2" });
    await expect.poll(() => cardIdsIn(page, "👀 Reviewing")).toEqual(["pr_test_repo_1"]);

    // Edits land in localStorage like a manual edit. (A reload would re-run the seed script.)
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem("review365:board") ?? "{}").cards,
    );
    expect(saved.pr_test_repo_1).toMatchObject({ column: "reviewing", note: "Ping author" });
    expect(saved.pr_test_repo_2).toMatchObject({ column: "reviewing", archived: true });
  });

  test("an invalid call returns an error and changes nothing", async ({ page, request }) => {
    const token = newToken();
    await seed(page, { enabled: true, token });
    // The open command stream keeps the network busy, so never wait for networkidle.
    await page.goto("/");
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    await waitForTab(request, token);

    const res = await mcpCall(request, token, "move_card", {
      card_id: "pr_test_repo_1",
      column_id: "nope",
    });
    expect(res).toEqual({ isError: true, text: "Unknown column: nope" });
    expect((await cardIdsIn(page, "📥 Inbox")).length).toBe(2);
  });

  test("access is off by default and pairs from Settings", async ({ page, request }) => {
    await seed(page, null);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });

    await page.locator("button", { hasText: "Settings" }).click();
    const toggle = page.getByRole("checkbox", { name: "Allow AI agents to edit this board" });
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 10_000 });
    const command = await page.getByTestId("mcp-add-command").textContent();
    expect(command).toContain("claude mcp add --transport http review365");
    expect(command).toContain("/api/mcp");
    const token = /Bearer ([\w-]+)/.exec(command ?? "")?.[1] ?? "";
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect((await mcpCall(request, token, "get_board")).isError).toBe(false);

    // A new token cuts off the old one.
    await page.getByRole("button", { name: "New token" }).click();
    await expect(page.getByTestId("mcp-add-command")).not.toContainText(token);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 10_000 });
    expect((await mcpCall(request, token, "get_board")).isError).toBe(true);

    await toggle.uncheck();
    await expect(page.getByTestId("mcp-add-command")).toBeHidden();
  });

  test("only one tab answers when several are open", async ({ context, request }) => {
    const token = newToken();
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) {
      await seed(page, { enabled: true, token });
      await page.goto("/");
      await expect(page.getByText("Two PR")).toBeVisible({ timeout: 5000 });
    }
    await waitForTab(request, token);
    await mcpCall(request, token, "move_card", {
      card_id: "pr_test_repo_1",
      column_id: "reviewing",
    });
    // A tab only repaints for edits it ran itself, so exactly one tab shows the move.
    const moved = async () =>
      (await cardIdsIn(first, "👀 Reviewing")).length +
      (await cardIdsIn(second, "👀 Reviewing")).length;
    await expect.poll(moved).toBe(1);
    await first.waitForTimeout(500);
    expect(await moved()).toBe(1);
  });
});
