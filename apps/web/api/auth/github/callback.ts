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
} from "../../_lib/github-oauth.js";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = getAppOrigin(url);
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

  const { clientId, clientSecret, configured } = getOAuthConfig();
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
}
