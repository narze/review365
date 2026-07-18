import { describe, expect, test } from "bun:test";
import {
  buildAuthorizeUrl,
  callbackRedirectUri,
  getAppOrigin,
  getOAuthConfig,
  isGitHubAppClientId,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  readCookie,
  STATE_COOKIE,
} from "./github-oauth";

describe("github-oauth helpers", () => {
  test("getOAuthConfig requires both id and secret", () => {
    expect(getOAuthConfig({}).configured).toBe(false);
    expect(getOAuthConfig({ GITHUB_CLIENT_ID: "id" }).configured).toBe(false);
    expect(
      getOAuthConfig({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "sec" }).configured,
    ).toBe(true);
  });

  test("getAppOrigin prefers APP_ORIGIN then CF_PAGES_URL then VERCEL_URL then request origin", () => {
    const req = new URL("http://localhost:5173/api/auth/github/start");
    expect(getAppOrigin(req, { APP_ORIGIN: "https://app.example/" })).toBe(
      "https://app.example",
    );
    expect(getAppOrigin(req, { CF_PAGES_URL: "https://review365.pages.dev/" })).toBe(
      "https://review365.pages.dev",
    );
    expect(getAppOrigin(req, { VERCEL_URL: "review365.vercel.app" })).toBe(
      "https://review365.vercel.app",
    );
    expect(getAppOrigin(req, {})).toBe("http://localhost:5173");
  });

  test("getAppOrigin APP_ORIGIN wins over CF_PAGES_URL", () => {
    const req = new URL("http://localhost:5173/api/auth/github/start");
    expect(
      getAppOrigin(req, {
        APP_ORIGIN: "https://custom.example",
        CF_PAGES_URL: "https://review365.pages.dev",
      }),
    ).toBe("https://custom.example");
  });

  test("buildAuthorizeUrl includes scopes and state", () => {
    const url = new URL(
      buildAuthorizeUrl("cid", "https://app.example/api/auth/github/callback", "abc"),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toBe("repo read:org");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/auth/github/callback",
    );
  });

  test("callback and result redirects", () => {
    expect(callbackRedirectUri("https://app.example")).toBe(
      "https://app.example/api/auth/github/callback",
    );
    expect(oauthSuccessRedirect("https://app.example", "tok")).toBe(
      "https://app.example/settings/oauth#access_token=tok",
    );
    expect(oauthErrorRedirect("https://app.example", "access_denied")).toContain(
      "error=access_denied",
    );
  });

  test("readCookie parses state cookie", () => {
    expect(readCookie(`${STATE_COOKIE}=xyz; Path=/`, STATE_COOKIE)).toBe("xyz");
    expect(readCookie("other=1", STATE_COOKIE)).toBeNull();
  });

  test("isGitHubAppClientId detects GitHub App client IDs", () => {
    expect(isGitHubAppClientId("Iv23li8ilCQ8mH7qTsH5")).toBe(true);
    expect(isGitHubAppClientId("Ov23liexampleoauthapp")).toBe(false);
    expect(isGitHubAppClientId("")).toBe(false);
  });
});
