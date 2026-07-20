import { describe, expect, it } from "bun:test";
import type { PRCard } from "@review365/api/types";
import { cardMatchesQuery, filterCardsByQuery } from "./card-filter";

function card(overrides: Partial<PRCard> = {}): PRCard {
  return {
    id: "gh:acme/web:42",
    platform: "github",
    prNumber: 42,
    repo: "acme/web",
    title: "Add auth guard to settings",
    author: "narze",
    url: "https://github.com/acme/web/pull/42",
    updatedAt: new Date(0).toISOString(),
    isOwnPR: false,
    columnId: "inbox",
    signals: [],
    archived: false,
    order: 0,
    ...overrides,
  };
}

describe("cardMatchesQuery", () => {
  it("matches everything on an empty or whitespace query", () => {
    expect(cardMatchesQuery(card(), "")).toBe(true);
    expect(cardMatchesQuery(card(), "   ")).toBe(true);
  });

  it("matches case-insensitive substrings of the title", () => {
    expect(cardMatchesQuery(card(), "AUTH")).toBe(true);
    expect(cardMatchesQuery(card(), "guard")).toBe(true);
    expect(cardMatchesQuery(card(), "logout")).toBe(false);
  });

  it("matches author and repo", () => {
    expect(cardMatchesQuery(card(), "narze")).toBe(true);
    expect(cardMatchesQuery(card(), "acme/web")).toBe(true);
    expect(cardMatchesQuery(card(), "other-user")).toBe(false);
  });

  it("matches the PR number with or without a leading #", () => {
    expect(cardMatchesQuery(card(), "42")).toBe(true);
    expect(cardMatchesQuery(card(), "#42")).toBe(true);
    expect(cardMatchesQuery(card(), "#99")).toBe(false);
  });

  it("matches note text when present", () => {
    expect(cardMatchesQuery(card({ note: "ping reviewer" }), "ping")).toBe(true);
    expect(cardMatchesQuery(card(), "ping")).toBe(false);
  });

  it("ANDs whitespace-separated terms across fields", () => {
    expect(cardMatchesQuery(card(), "narze auth")).toBe(true);
    expect(cardMatchesQuery(card(), "narze logout")).toBe(false);
  });

  it("does not match a term that straddles two fields", () => {
    // title ends "...settings", author is "narze" — the joined-with-newline text
    // must not let "settingsnarze" match.
    expect(cardMatchesQuery(card(), "settingsnarze")).toBe(false);
  });
});

describe("filterCardsByQuery", () => {
  const cards = [
    card({ id: "a", prNumber: 1, title: "Fix login redirect", author: "alice" }),
    card({ id: "b", prNumber: 2, title: "Add auth guard", author: "narze" }),
    card({ id: "c", prNumber: 3, title: "Bump deps", author: "narze" }),
  ];

  it("returns the full list unchanged for an empty query", () => {
    expect(filterCardsByQuery(cards, "  ")).toBe(cards);
  });

  it("keeps only matching cards in input order", () => {
    expect(filterCardsByQuery(cards, "narze").map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterCardsByQuery(cards, "auth").map((c) => c.id)).toEqual(["b"]);
    expect(filterCardsByQuery(cards, "nomatch")).toEqual([]);
  });
});
