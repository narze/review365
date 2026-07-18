import { describe, expect, it, mock } from "bun:test";
import type { PRCard, ColumnDef, DiscordConfig } from "../types";
import {
  buildCardMovedEmbed,
  notifyCardMoved,
  sendTestMessage,
  DISCORD_COLORS,
} from "./discord";

function makeCard(overrides: Partial<PRCard> = {}): PRCard {
  return {
    id: "pr_owner_repo_1",
    platform: "github",
    prNumber: 1,
    repo: "owner/repo",
    title: "Add login page",
    author: "alice",
    url: "https://github.com/owner/repo/pull/1",
    updatedAt: new Date("2026-01-01").toISOString(),
    isOwnPR: false,
    columnId: "approved",
    signals: ["approved"],
    archived: false,
    order: 0,
    ...overrides,
  };
}

const APPROVED_COLUMN: ColumnDef = { id: "approved", title: "✅ Approved" };

// ── buildCardMovedEmbed ──

describe("buildCardMovedEmbed", () => {
  it("includes title, url, and column name", () => {
    const card = makeCard();
    const embed = buildCardMovedEmbed(card, APPROVED_COLUMN);
    expect(embed.title).toBe("Add login page");
    expect(embed.url).toBe("https://github.com/owner/repo/pull/1");
    expect(embed.description).toContain("✅ Approved");
  });

  it("uses platform-correct label in fields (GitHub PR vs GitLab MR)", () => {
    const gh = buildCardMovedEmbed(makeCard(), APPROVED_COLUMN);
    const ghField = gh.fields?.find((f) => f.name === "GitHub PR");
    expect(ghField?.value).toBe("#1");

    const gl = buildCardMovedEmbed(makeCard({ platform: "gitlab" }), APPROVED_COLUMN);
    const glField = gl.fields?.find((f) => f.name === "GitLab MR");
    expect(glField?.value).toBe("#1");
    expect(gl.fields?.some((f) => f.name === "GitHub PR")).toBe(false);
  });

  it("includes repository, author, and signals fields", () => {
    const embed = buildCardMovedEmbed(makeCard({ signals: ["review-requested", "own-pr"] }), APPROVED_COLUMN);
    const names = embed.fields?.map((f) => f.name) ?? [];
    expect(names).toContain("Repository");
    expect(names).toContain("Author");
    expect(names).toContain("Signals");
  });

  it("picks danger color when changes-requested signal is present", () => {
    const embed = buildCardMovedEmbed(makeCard({ signals: ["changes-requested"] }), APPROVED_COLUMN);
    expect(embed.color).toBe(DISCORD_COLORS.danger);
  });

  it("picks success color for approved / merged", () => {
    expect(buildCardMovedEmbed(makeCard({ signals: ["approved"] }), APPROVED_COLUMN).color).toBe(
      DISCORD_COLORS.success,
    );
    expect(buildCardMovedEmbed(makeCard({ signals: ["merged"] }), APPROVED_COLUMN).color).toBe(
      DISCORD_COLORS.success,
    );
  });

  it("picks warning color for review-requested", () => {
    const embed = buildCardMovedEmbed(makeCard({ signals: ["review-requested"] }), APPROVED_COLUMN);
    expect(embed.color).toBe(DISCORD_COLORS.warning);
  });

  it("picks info color when no signals", () => {
    const embed = buildCardMovedEmbed(makeCard({ signals: [] }), APPROVED_COLUMN);
    expect(embed.color).toBe(DISCORD_COLORS.info);
  });

  it("escapes Discord markdown in title and author", () => {
    const embed = buildCardMovedEmbed(
      makeCard({ title: "fix: **critical** _bug_ `code`", author: "user*name" }),
      APPROVED_COLUMN,
    );
    expect(embed.title).toBe("fix: \\*\\*critical\\*\\* \\_bug\\_ \\`code\\`");
    const authorField = embed.fields?.find((f) => f.name === "Author");
    expect(authorField?.value).toBe("user\\*name");
  });

  it("truncates title to 256 chars (Discord embed limit)", () => {
    const long = "x".repeat(500);
    const embed = buildCardMovedEmbed(makeCard({ title: long }), APPROVED_COLUMN);
    expect(embed.title?.length).toBe(256);
  });
});

// ── notifyCardMoved ──

describe("notifyCardMoved", () => {
  function mockFetch(ok: boolean, status = 200): typeof fetch {
    const fn = mock(() =>
      Promise.resolve(
        new Response(null, { status: ok ? status : 500, ok }),
      ),
    ) as unknown as typeof fetch;
    return fn;
  }

  it("returns false when discord config is undefined", async () => {
    const fetchImpl = mockFetch(true);
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, undefined, fetchImpl);
    expect(result).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns false when webhookUrl is empty", async () => {
    const fetchImpl = mockFetch(true);
    const cfg: DiscordConfig = { webhookUrl: "", notifyColumnIds: ["approved"] };
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    expect(result).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns false without calling fetch when column not in notify list", async () => {
    const fetchImpl = mockFetch(true);
    const cfg: DiscordConfig = {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["inbox"],
    };
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    expect(result).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts JSON payload to webhook URL and returns true on 2xx", async () => {
    const fetchImpl = mockFetch(true, 204);
    const cfg: DiscordConfig = {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["approved"],
      botName: "ReviewerBot",
    };
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof mock>).mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/abc");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.username).toBe("ReviewerBot");
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].url).toBe("https://github.com/owner/repo/pull/1");
  });

  it("uses default username 'Review365' when botName is missing", async () => {
    const fetchImpl = mockFetch(true, 204);
    const cfg: DiscordConfig = {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["approved"],
    };
    await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    const body = JSON.parse(
      ((fetchImpl as unknown as ReturnType<typeof mock>).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.username).toBe("Review365");
  });

  it("returns false on non-2xx response without throwing", async () => {
    const fetchImpl = mockFetch(false, 429);
    const cfg: DiscordConfig = {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["approved"],
    };
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    expect(result).toBe(false);
  });

  it("swallows network errors and returns false", async () => {
    const fetchImpl = mock(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    const cfg: DiscordConfig = {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["approved"],
    };
    const result = await notifyCardMoved(makeCard(), APPROVED_COLUMN, cfg, fetchImpl);
    expect(result).toBe(false);
  });
});

// ── sendTestMessage ──

describe("sendTestMessage", () => {
  it("returns false for empty webhook URL without calling fetch", async () => {
    const fn = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    expect(await sendTestMessage("", "Bot", fn)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("posts to the trimmed URL and returns true on 2xx", async () => {
    const fn = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    const result = await sendTestMessage(
      "  https://discord.com/api/webhooks/abc  ",
      "MyBot",
      fn,
    );
    expect(result).toBe(true);
    const [url, init] = (fn as unknown as ReturnType<typeof mock>).mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/abc");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.username).toBe("MyBot");
    expect(body.embeds[0].title).toContain("test ping");
  });

  it("returns false on network error", async () => {
    const fn = mock(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await sendTestMessage("https://discord.com/api/webhooks/abc", undefined, fn)).toBe(false);
  });
});
