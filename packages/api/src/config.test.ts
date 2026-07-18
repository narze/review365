import { describe, expect, it } from "bun:test";
import type { BoardConfig } from "./types";
import {
  addColumn,
  renameColumn,
  deleteColumn,
  reorderColumns,
  addRule,
  deleteRule,
  createDefaultConfig,
  setColumnWidth,
  setDiscord,
  clearDiscord,
} from "./config";

function emptyConfig(): BoardConfig {
  return { columns: [], rules: [] };
}

// ── columns ──

describe("addColumn", () => {
  it("adds column with generated id", () => {
    const result = addColumn(emptyConfig(), "My Column");
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].title).toBe("My Column");
    expect(result.columns[0].id).toMatch(/^col_\d+_/);
  });
});

describe("renameColumn", () => {
  it("renames matching column", () => {
    const config: BoardConfig = {
      columns: [
        { id: "inbox", title: "Inbox" },
        { id: "approved", title: "Approved" },
      ],
      rules: [],
    };
    const result = renameColumn(config, "inbox", "📥 Inbox");
    expect(result.columns[0].title).toBe("📥 Inbox");
    expect(result.columns[1].title).toBe("Approved");
  });

  it("noops for unknown id", () => {
    const config: BoardConfig = {
      columns: [{ id: "inbox", title: "Inbox" }],
      rules: [],
    };
    const result = renameColumn(config, "nonexistent", "X");
    expect(result.columns[0].title).toBe("Inbox");
  });
});

describe("deleteColumn", () => {
  it("removes column and its rules", () => {
    const config: BoardConfig = {
      columns: [
        { id: "inbox", title: "Inbox" },
        { id: "merged", title: "Merged" },
      ],
      rules: [
        { id: "r1", signal: "merged", columnId: "merged" },
        { id: "r2", signal: "pr-open", columnId: "inbox" },
      ],
    };
    const result = deleteColumn(config, "merged");
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].id).toBe("inbox");
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("r2");
  });

  it("preserves mergedRetentionDays and columnWidthPx", () => {
    const config: BoardConfig = {
      columns: [
        { id: "inbox", title: "Inbox" },
        { id: "merged", title: "Merged" },
      ],
      rules: [],
      mergedRetentionDays: 30,
      columnWidthPx: 480,
    };
    const result = deleteColumn(config, "merged");
    expect(result.mergedRetentionDays).toBe(30);
    expect(result.columnWidthPx).toBe(480);
  });
});

describe("reorderColumns", () => {
  it("reorders columns by id list", () => {
    const config: BoardConfig = {
      columns: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
      ],
      rules: [],
    };
    const result = reorderColumns(config, ["c", "a", "b"]);
    expect(result.columns.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("filters out unknown ids", () => {
    const config: BoardConfig = {
      columns: [{ id: "a", title: "A" }],
      rules: [],
    };
    const result = reorderColumns(config, ["x", "a"]);
    expect(result.columns.map((c) => c.id)).toEqual(["a"]);
  });
});

// ── rules ──

describe("addRule", () => {
  it("adds rule with generated id", () => {
    const result = addRule(emptyConfig(), "approved", "approved_col");
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].signal).toBe("approved");
    expect(result.rules[0].columnId).toBe("approved_col");
    expect(result.rules[0].id).toMatch(/^rule_\d+_/);
  });
});

describe("deleteRule", () => {
  it("removes rule by id", () => {
    const config: BoardConfig = {
      columns: [],
      rules: [
        { id: "r1", signal: "merged", columnId: "merged" },
        { id: "r2", signal: "approved", columnId: "approved" },
      ],
    };
    const result = deleteRule(config, "r1");
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("r2");
  });

  it("noops for unknown id", () => {
    const config: BoardConfig = {
      columns: [],
      rules: [{ id: "r1", signal: "merged", columnId: "merged" }],
    };
    const result = deleteRule(config, "nonexistent");
    expect(result.rules).toHaveLength(1);
  });
});

// ── default config ──

describe("createDefaultConfig", () => {
  it("has default columns and rules", () => {
    const c = createDefaultConfig();
    expect(c.columns.length).toBeGreaterThan(0);
    expect(c.rules.length).toBeGreaterThan(0);
    expect(c.mergedRetentionDays).toBe(14);
    expect(c.columnWidthPx).toBe(300);
  });
});

describe("setColumnWidth", () => {
  it("clamps to 200–800", () => {
    const config = emptyConfig();
    expect(setColumnWidth(config, 150).columnWidthPx).toBe(200);
    expect(setColumnWidth(config, 500).columnWidthPx).toBe(500);
    expect(setColumnWidth(config, 900).columnWidthPx).toBe(800);
  });
});

// ── Discord config ──

describe("setDiscord", () => {
  it("stores webhook URL and column ids", () => {
    const config = emptyConfig();
    const result = setDiscord(config, {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: ["approved"],
    });
    expect(result.discord?.webhookUrl).toBe("https://discord.com/api/webhooks/abc");
    expect(result.discord?.notifyColumnIds).toEqual(["approved"]);
  });

  it("trims whitespace in webhook URL", () => {
    const result = setDiscord(emptyConfig(), {
      webhookUrl: "  https://discord.com/api/webhooks/xyz  ",
      notifyColumnIds: [],
    });
    expect(result.discord?.webhookUrl).toBe("https://discord.com/api/webhooks/xyz");
  });

  it("disables (sets undefined) when webhook URL is empty", () => {
    const config: BoardConfig = {
      ...emptyConfig(),
      discord: { webhookUrl: "https://discord.com/api/webhooks/old", notifyColumnIds: ["x"] },
    };
    const result = setDiscord(config, { webhookUrl: "   ", notifyColumnIds: [] });
    expect(result.discord).toBeUndefined();
  });

  it("preserves other config fields", () => {
    const config: BoardConfig = {
      ...emptyConfig(),
      mergedRetentionDays: 21,
      slaWarningDays: 5,
    };
    const result = setDiscord(config, {
      webhookUrl: "https://discord.com/api/webhooks/abc",
      notifyColumnIds: [],
    });
    expect(result.mergedRetentionDays).toBe(21);
    expect(result.slaWarningDays).toBe(5);
  });
});

describe("clearDiscord", () => {
  it("removes the discord field entirely", () => {
    const config: BoardConfig = {
      ...emptyConfig(),
      discord: { webhookUrl: "https://discord.com/api/webhooks/abc", notifyColumnIds: [] },
    };
    const result = clearDiscord(config);
    expect(result.discord).toBeUndefined();
  });

  it("returns same reference when already absent", () => {
    const config = emptyConfig();
    expect(clearDiscord(config)).toBe(config);
  });
});
