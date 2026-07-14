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

describe("github fetchPRs", () => {
  it("includes a compact CI status from the PR head commit's check runs", async () => {
    mockFetch([
      {
        match: "/repos/acme/widgets/pulls?state=open",
        body: [
          {
            number: 42,
            title: "Ship checks",
            html_url: "https://github.com/acme/widgets/pull/42",
            updated_at: "2026-07-14T00:00:00Z",
            user: { login: "bob" },
            draft: false,
            head: { sha: "abc123" },
          },
        ],
      },
      { match: "/search/issues", body: { items: [] } },
      { match: "/repos/acme/widgets/pulls/42/reviews", body: [] },
      {
        match: "/repos/acme/widgets/commits/abc123/check-runs",
        body: {
          check_runs: [
            { name: "unit", status: "completed", conclusion: "success" },
            { name: "lint", status: "completed", conclusion: "failure" },
          ],
        },
      },
    ]);

    const [pr] = await githubProvider.fetchPRs(ctx(), ["acme/widgets"], true);

    expect(pr.ciStatus).toEqual({ state: "failure", total: 2, failing: ["lint"] });
  });
});
