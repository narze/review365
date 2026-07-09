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
    reviewers: [{ username: "alice" }],
    project_id: 10,
  };
  const ownMr = {
    iid: 2,
    title: "My change",
    web_url: "https://gitlab.com/grp/proj/-/merge_requests/2",
    updated_at: "2026-07-02T00:00:00Z",
    state: "opened",
    author: { username: "alice" },
    project_id: 10,
  };
  const mergedMr = {
    iid: 3,
    title: "Shipped",
    web_url: "https://gitlab.com/grp/proj/-/merge_requests/3",
    updated_at: "2026-07-03T00:00:00Z",
    state: "merged",
    author: { username: "alice" },
    project_id: 10,
  };

  function routes() {
    return [
      { match: "/projects/grp%2Fproj/merge_requests?state=opened", body: [reviewerMr, ownMr] },
      { match: "/projects/grp%2Fproj/merge_requests?state=merged", body: [mergedMr] },
      { match: "/projects/10/merge_requests/2/approvals", body: { approved_by: [] } },
    ];
  }

  it("returns no cards when the watchlist is empty", async () => {
    mockFetch(routes());
    const prs = await gitlabProvider.fetchPRs(ctx(), [], true, 14);
    expect(prs).toEqual([]);
    expect(calls.length).toBe(0);
  });

  it("maps all non-draft MRs in watchlisted projects to cards, excluding drafts", async () => {
    mockFetch(routes());
    const prs = await gitlabProvider.fetchPRs(ctx(), ["grp/proj"], true, 14);

    // draft MR (iid 1) is excluded entirely, even though alice is a requested reviewer
    expect(prs.find((p) => p.prNumber === 1)).toBeUndefined();

    const b = prs.find((p) => p.prNumber === 2)!;
    expect(b.id).toBe("mr_grp_proj_2");
    expect(b.platform).toBe("gitlab");
    expect(b.repo).toBe("grp/proj");
    expect(b.signals).toEqual(["pr-open", "own-pr"]);
    expect(b.isOwnPR).toBe(true);

    const c = prs.find((p) => p.prNumber === 3)!;
    expect(c.signals).toEqual(["merged", "own-pr"]);
  });

  it("adds approved (approvals-only, never changes-requested) for open MRs", async () => {
    // Distinct project/iid from the other cases, since the approvals cache is keyed by them.
    const approvedMr = { ...ownMr, iid: 20, project_id: 20 };
    mockFetch([
      { match: "/projects/grp%2Fproj/merge_requests?state=opened", body: [approvedMr] },
      { match: "/projects/grp%2Fproj/merge_requests?state=merged", body: [] },
      {
        match: "/projects/20/merge_requests/20/approvals",
        body: { approved_by: [{ user: { username: "carol" } }] },
      },
    ]);
    const prs = await gitlabProvider.fetchPRs(ctx(), ["grp/proj"], true, 14);
    const b = prs.find((p) => p.prNumber === 20)!;
    expect(b.signals).toContain("approved");
    expect(prs.every((p) => !p.signals.includes("changes-requested"))).toBe(true);
  });

  it("does not fetch MRs for projects outside the watchlist", async () => {
    mockFetch([
      ...routes(),
      { match: "/projects/grp%2Fother/merge_requests?state=opened", body: [] },
      { match: "/projects/grp%2Fother/merge_requests?state=merged", body: [] },
    ]);
    await gitlabProvider.fetchPRs(ctx(), ["grp/other"], true, 14);
    expect(calls.some((c) => c.url.includes("grp%2Fproj"))).toBe(false);
  });

  it("handles nested group paths", async () => {
    mockFetch([
      {
        match: "/projects/group%2Fsub%2Fproj/merge_requests?state=opened",
        body: [{ ...ownMr, iid: 7 }],
      },
      { match: "/projects/group%2Fsub%2Fproj/merge_requests?state=merged", body: [] },
      { match: "/projects/10/merge_requests/7/approvals", body: { approved_by: [] } },
    ]);
    const prs = await gitlabProvider.fetchPRs(ctx(), ["group/sub/proj"], true, 14);
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
