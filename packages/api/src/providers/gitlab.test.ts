import { afterEach, describe, expect, it } from "bun:test";
import { gitlabProvider } from "./gitlab";
import type { ProviderContext } from "./types";

interface Route {
  match: string;
  body: unknown;
  status?: number;
}

interface Call {
  url: string;
  headers: Record<string, string>;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function mockFetch(routes: Route[]) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  gitlabProvider.invalidateCache();
});

const ctx = (over: Partial<ProviderContext> = {}): ProviderContext => ({
  token: "glpat-xyz",
  user: "alice",
  ...over,
});

describe("gitlab validateToken", () => {
  it("sends PRIVATE-TOKEN header and returns the username", async () => {
    mockFetch([{ match: "/api/v4/user", body: { username: "alice" } }]);
    const res = await gitlabProvider.validateToken("glpat-xyz");
    expect(res).toEqual({ user: "alice" });
    expect(calls[0]?.url).toBe("https://gitlab.com/api/v4/user");
    expect(calls[0]?.headers["PRIVATE-TOKEN"]).toBe("glpat-xyz");
  });

  it("targets a self-hosted host when provided", async () => {
    mockFetch([{ match: "/api/v4/user", body: { username: "bob" } }]);
    await gitlabProvider.validateToken("t", "https://gitlab.example.com/");
    expect(calls[0]?.url).toBe("https://gitlab.example.com/api/v4/user");
  });
});

describe("gitlab fetchPRs", () => {
  const reviewerMr = {
    iid: 1,
    title: "Add feature",
    web_url: "https://gitlab.com/grp/proj/-/merge_requests/1",
    updated_at: "2026-07-01T00:00:00Z",
    state: "opened",
    draft: true,
    author: { username: "bob" },
    project_id: 10,
    references: { full: "grp/proj!1" },
  };
  const ownMr = {
    iid: 2,
    title: "My change",
    web_url: "https://gitlab.com/grp/proj2/-/merge_requests/2",
    updated_at: "2026-07-02T00:00:00Z",
    state: "opened",
    author: { username: "alice" },
    project_id: 11,
    references: { full: "grp/proj2!2" },
  };
  const mergedMr = {
    iid: 3,
    title: "Shipped",
    web_url: "https://gitlab.com/grp/proj3/-/merge_requests/3",
    updated_at: "2026-07-03T00:00:00Z",
    state: "merged",
    author: { username: "alice" },
    project_id: 12,
    references: { full: "grp/proj3!3" },
  };

  function routes() {
    return [
      { match: "reviewer_username=alice", body: [reviewerMr] },
      { match: "author_username=alice&state=opened", body: [ownMr] },
      { match: "author_username=alice&state=merged", body: [mergedMr] },
      {
        match: "/projects/10/merge_requests/1/approvals",
        body: { approved_by: [{ user: { username: "carol" } }] },
      },
    ];
  }

  it("maps MRs to cards with the right ids, iid as prNumber, and signals", async () => {
    mockFetch(routes());
    const prs = await gitlabProvider.fetchPRs(ctx(), [], true, 14);

    const a = prs.find((p) => p.prNumber === 1)!;
    expect(a.id).toBe("mr_grp_proj_1");
    expect(a.platform).toBe("gitlab");
    expect(a.repo).toBe("grp/proj");
    expect(a.author).toBe("bob");
    expect(a.isOwnPR).toBe(false);
    expect(a.signals).toEqual(["pr-open", "review-requested", "draft"]);

    const b = prs.find((p) => p.prNumber === 2)!;
    expect(b.signals).toEqual(["pr-open", "own-pr"]);
    expect(b.isOwnPR).toBe(true);

    const c = prs.find((p) => p.prNumber === 3)!;
    expect(c.signals).toEqual(["merged", "own-pr"]);
  });

  it("adds approved (approvals-only, never changes-requested) for watchlisted MRs", async () => {
    mockFetch(routes());
    const prs = await gitlabProvider.fetchPRs(ctx(), ["grp/proj"], true, 14);
    const a = prs.find((p) => p.prNumber === 1)!;
    expect(a.signals).toContain("approved");
    expect(prs.every((p) => !p.signals.includes("changes-requested"))).toBe(true);
  });

  it("does not fetch approvals for MRs outside the watchlist", async () => {
    mockFetch(routes());
    await gitlabProvider.fetchPRs(ctx(), ["grp/other"], true, 14);
    expect(calls.some((c) => c.url.includes("/approvals"))).toBe(false);
  });

  it("handles nested group paths", async () => {
    mockFetch([
      {
        match: "reviewer_username=alice",
        body: [{ ...reviewerMr, iid: 7, references: { full: "group/sub/proj!7" } }],
      },
      { match: "author_username=alice&state=opened", body: [] },
      { match: "author_username=alice&state=merged", body: [] },
    ]);
    const prs = await gitlabProvider.fetchPRs(ctx(), [], true, 14);
    expect(prs[0]?.repo).toBe("group/sub/proj");
    expect(prs[0]?.id).toBe("mr_group_sub_proj_7");
  });
});

describe("gitlab fetchOwnedRepos", () => {
  it("returns path_with_namespace, drops archived, and passes the search term", async () => {
    mockFetch([
      {
        match: "/projects?membership=true",
        body: [
          { path_with_namespace: "grp/active", archived: false },
          { path_with_namespace: "grp/dead", archived: true },
        ],
      },
    ]);
    const repos = await gitlabProvider.fetchOwnedRepos(ctx({ user: "u1" }), "act");
    expect(repos).toEqual(["grp/active"]);
    expect(calls[0]?.url).toContain("search=act");
  });
});
