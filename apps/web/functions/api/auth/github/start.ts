/**
 * Cloudflare Pages Function — `/api/auth/github/start`
 *
 * Kicks off the classic GitHub OAuth flow:
 *   1. Build an authorize URL with a random `state`
 *   2. Set the state in an HttpOnly cookie
 *   3. 302 redirect to https://github.com/login/oauth/authorize
 *
 * File-path mapping (Cloudflare Pages convention):
 *   apps/web/functions/api/auth/github/start.ts → /api/auth/github/start
 */

import {
  buildAuthorizeUrl,
  callbackRedirectUri,
  getAppOrigin,
  getOAuthConfig,
  isGitHubAppClientId,
  oauthErrorRedirect,
  randomState,
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
  const { clientId, configured } = getOAuthConfig(env);

  if (!configured) {
    return Response.redirect(oauthErrorRedirect(origin, "oauth_not_configured"), 302);
  }

  if (isGitHubAppClientId(clientId)) {
    return Response.redirect(oauthErrorRedirect(origin, "github_app_not_supported"), 302);
  }

  const state = randomState();
  const redirectUri = callbackRedirectUri(origin);
  const authorizeUrl = buildAuthorizeUrl(clientId, redirectUri, state);
  const secure = origin.startsWith("https://");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      "Set-Cookie": stateCookieHeader(state, { secure }),
      "Cache-Control": "no-store",
    },
  });
};
