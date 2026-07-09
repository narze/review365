import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import {
  buildAuthorizeUrl,
  callbackRedirectUri,
  exchangeCodeForToken,
  getAppOrigin,
  getOAuthConfig,
  isGitHubAppClientId,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  randomState,
  readCookie,
  STATE_COOKIE,
  stateCookieHeader,
} from "./api/_lib/github-oauth";

/** Repo root (for .env) — one level above apps/web. */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sendRedirect(res: ServerResponse, location: string, setCookie?: string) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  res.end();
}

/** Local-dev stand-in for Vercel `/api/auth/github/*` edge functions. */
export function githubOAuthDevPlugin(): Plugin {
  return {
    name: "review365-github-oauth",
    configureServer(server) {
      const env = { ...process.env, ...loadEnv(server.config.mode, rootDir, "") };

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?")[0];
        if (pathname !== "/api/auth/github/start" && pathname !== "/api/auth/github/callback") {
          next();
          return;
        }

        const host = req.headers.host ?? "localhost:5173";
        const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
        const requestUrl = new URL(rawUrl, `${proto}://${host}`);
        const origin = getAppOrigin(requestUrl, env);
        const secure = origin.startsWith("https://");
        const { clientId, clientSecret, configured } = getOAuthConfig(env);

        if (pathname === "/api/auth/github/start") {
          if (!configured) {
            sendRedirect(res, oauthErrorRedirect(origin, "oauth_not_configured"));
            return;
          }
          if (isGitHubAppClientId(clientId)) {
            sendRedirect(res, oauthErrorRedirect(origin, "github_app_not_supported"));
            return;
          }
          const state = randomState();
          const authorizeUrl = buildAuthorizeUrl(
            clientId,
            callbackRedirectUri(origin),
            state,
          );
          sendRedirect(res, authorizeUrl, stateCookieHeader(state, { secure }));
          return;
        }

        // callback
        const clearCookie = stateCookieHeader("", { secure, clear: true });
        const oauthError = requestUrl.searchParams.get("error");
        if (oauthError) {
          sendRedirect(res, oauthErrorRedirect(origin, oauthError), clearCookie);
          return;
        }
        if (!configured) {
          sendRedirect(res, oauthErrorRedirect(origin, "oauth_not_configured"), clearCookie);
          return;
        }

        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        const expected = readCookie(req.headers.cookie ?? null, STATE_COOKIE);
        if (!code || !state || !expected || state !== expected) {
          sendRedirect(res, oauthErrorRedirect(origin, "invalid_state"), clearCookie);
          return;
        }

        const result = await exchangeCodeForToken(
          code,
          clientId,
          clientSecret,
          callbackRedirectUri(origin),
        );
        if ("error" in result) {
          sendRedirect(res, oauthErrorRedirect(origin, result.error), clearCookie);
          return;
        }

        sendRedirect(res, oauthSuccessRedirect(origin, result.accessToken), clearCookie);
      });
    },
  };
}
