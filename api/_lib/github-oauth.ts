/** Shared GitHub OAuth helpers for Vercel functions and Vite dev middleware. */

export const GITHUB_OAUTH_SCOPES = "repo read:org";
export const STATE_COOKIE = "review365_gh_oauth_state";
export const STATE_MAX_AGE_SEC = 600;

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  configured: boolean;
};

export function getOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): OAuthConfig {
  const clientId = env.GITHUB_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim() ?? "";
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

/** Public origin for redirect_uri (no trailing slash). */
export function getAppOrigin(
  requestUrl: URL,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.APP_ORIGIN?.trim() || env.PUBLIC_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return requestUrl.origin;
}

export function callbackRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/auth/github/callback`;
}

export function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function stateCookieHeader(
  state: string,
  opts: { secure: boolean; clear?: boolean } = { secure: true },
): string {
  if (opts.clear) {
    return `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${opts.secure ? "; Secure" : ""}`;
  }
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SEC}${opts.secure ? "; Secure" : ""}`;
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string } | { error: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    return { error: "token_exchange_failed" };
  }

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    return { error: data.error ?? "token_exchange_failed" };
  }

  return { accessToken: data.access_token };
}

export function oauthSuccessRedirect(origin: string, accessToken: string): string {
  // Hash fragment keeps the token out of server logs / Referer on subsequent navigations.
  return `${origin}/settings/oauth#access_token=${encodeURIComponent(accessToken)}`;
}

export function oauthErrorRedirect(origin: string, error: string): string {
  return `${origin}/settings/oauth?error=${encodeURIComponent(error)}`;
}
