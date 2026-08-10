import { describe, expect, it } from "bun:test";
import { groupCardsByRepo } from "./card-grouping";

type Fake = { id: string; repo: string };
const c = (id: string, repo: string): Fake => ({ id, repo });

describe("groupCardsByRepo", () => {
  it("empty input stays empty", () => {
    expect(groupCardsByRepo([])).toEqual([]);
  });

  it("a single repo is unaffected", () => {
    const cards = [c("1", "a/one"), c("2", "a/one")];
    expect(groupCardsByRepo(cards)).toEqual(cards);
  });

  it("clusters interleaved repos, sorted alphabetically, order preserved within a cluster", () => {
    const cards = [c("1", "b/repo"), c("2", "a/repo"), c("3", "b/repo"), c("4", "a/repo")];
    expect(groupCardsByRepo(cards).map((x) => x.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("does not mutate the input array", () => {
    const cards = [c("1", "b/repo"), c("2", "a/repo")];
    const copy = [...cards];
    groupCardsByRepo(cards);
    expect(cards).toEqual(copy);
  });
});
