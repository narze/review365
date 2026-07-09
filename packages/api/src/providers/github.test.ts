import { afterEach, describe, expect, it } from "bun:test";
import { githubProvider } from "./github";
import type { ProviderContext } from "./types";

interface Route {
  match: string | RegExp;
  body: unknown;
  headers?: Record<string, string>;
  status?: number;
}

const realFetch = globalThis.fetch;

function mockFetch(routes: Route[]) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes.find((r) =>
      typeof r.match === "string" ? url.includes(r.match) : r.match.test(url),
    );
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: route.headers,
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  githubProvider.invalidateCache();
});

const ctx = (over: Partial<ProviderContext> = {}): ProviderContext => ({
  token: "gho_test",
  user: "alice",
  ...over,
});

describe("github fetchOwnedRepos", () => {
  it("lists accessible repos from /user/repos and org endpoints, including private ones", async () => {
    mockFetch([
      { match: "/users/alice/orgs", body: [{ login: "eventpop" }] },
      {
        match: "/user/repos",
        body: [
          { full_name: "alice/private-app", archived: false },
          { full_name: "alice/archived", archived: true },
        ],
      },
      {
        match: "/orgs/eventpop/repos",
        body: [{ full_name: "eventpop/eventpop", archived: false }],
      },
    ]);

    const repos = await githubProvider.fetchOwnedRepos(ctx(), "event");
    expect(repos).toEqual(["eventpop/eventpop"]);
  });

  it("filters repos case-insensitively by query", async () => {
    mockFetch([
      { match: "/users/alice/orgs", body: [] },
      {
        match: "/user/repos",
        body: [
          { full_name: "alice/My-Repo", archived: false },
          { full_name: "alice/other", archived: false },
        ],
      },
    ]);

    const repos = await githubProvider.fetchOwnedRepos(ctx(), "my-repo");
    expect(repos).toEqual(["alice/My-Repo"]);
  });

  it("returns empty list for blank query", async () => {
    mockFetch([]);
    const repos = await githubProvider.fetchOwnedRepos(ctx(), "   ");
    expect(repos).toEqual([]);
  });

  it("continues when an org repo listing is forbidden", async () => {
    mockFetch([
      { match: "/users/alice/orgs", body: [{ login: "locked-org" }] },
      {
        match: "/user/repos",
        body: [{ full_name: "alice/visible", archived: false }],
      },
      {
        match: "/orgs/locked-org/repos",
        body: { message: "Forbidden" },
        status: 403,
      },
    ]);

    const repos = await githubProvider.fetchOwnedRepos(ctx(), "visible");
    expect(repos).toEqual(["alice/visible"]);
  });
});
