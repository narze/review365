import {
  buildAuthorizeUrl,
  callbackRedirectUri,
  getAppOrigin,
  getOAuthConfig,
  isGitHubAppClientId,
  oauthErrorRedirect,
  randomState,
  stateCookieHeader,
} from "../../_lib/github-oauth.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = getAppOrigin(url);
  const { clientId, configured } = getOAuthConfig();

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
}
