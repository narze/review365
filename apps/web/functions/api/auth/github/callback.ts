/**
 * Cloudflare Pages Function — `/api/auth/github/callback`
 *
 * OAuth callback handler:
 *   1. Verify `state` matches the HttpOnly cookie set by /start
 *   2. Exchange the GitHub `code` for an access token (server-side fetch)
 *   3. 302 redirect to `/settings/oauth#access_token=…` (hash fragment so the
 *      token never reaches the server in the next request's Referer header)
 *
 * File-path mapping (Cloudflare Pages convention):
 *   apps/web/functions/api/auth/github/callback.ts → /api/auth/github/callback
 */

import {
  callbackRedirectUri,
  exchangeCodeForToken,
  getAppOrigin,
  getOAuthConfig,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  readCookie,
  STATE_COOKIE,
  stateCookieHeader,
} from "../../../../api/_lib/github-oauth";

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  APP_ORIGIN?: string;
  /** Auto-injected by Cloudflare Pages (production + preview). */
  CF_PAGES_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const origin = getAppOrigin(url, env);
  const secure = origin.startsWith("https://");
  const clearCookie = stateCookieHeader("", { secure, clear: true });

  const redirect = (location: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Set-Cookie": clearCookie,
        "Cache-Control": "no-store",
      },
    });

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return redirect(oauthErrorRedirect(origin, oauthError));
  }

  const { clientId, clientSecret, configured } = getOAuthConfig(env);
  if (!configured) {
    return redirect(oauthErrorRedirect(origin, "oauth_not_configured"));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request.headers.get("cookie"), STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return redirect(oauthErrorRedirect(origin, "invalid_state"));
  }

  const redirectUri = callbackRedirectUri(origin);
  const result = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);

  if ("error" in result) {
    return redirect(oauthErrorRedirect(origin, result.error));
  }

  return redirect(oauthSuccessRedirect(origin, result.accessToken));
};
