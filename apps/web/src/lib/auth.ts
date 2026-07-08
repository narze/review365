import { getProvider } from "@review365/api/providers";
import type { Platform } from "@review365/api/types";

const PLATFORM_KEY = "review365:platform";

/** Per-platform localStorage keys. GitHub keeps the original unprefixed keys for backward compatibility. */
function keys(platform: Platform) {
  const prefix = platform === "github" ? "review365" : `review365:${platform}`;
  return {
    token: `${prefix}:token`,
    login: `${prefix}:login`,
    host: `${prefix}:host`,
  };
}

export function getPlatform(): Platform {
  return localStorage.getItem(PLATFORM_KEY) === "gitlab" ? "gitlab" : "github";
}

export function setPlatform(platform: Platform): void {
  localStorage.setItem(PLATFORM_KEY, platform);
}

export function getToken(platform: Platform = getPlatform()): string | null {
  return localStorage.getItem(keys(platform).token);
}

export function getLogin(platform: Platform = getPlatform()): string | null {
  return localStorage.getItem(keys(platform).login);
}

export function getHost(platform: Platform = getPlatform()): string | null {
  return localStorage.getItem(keys(platform).host);
}

export function hasToken(platform: Platform = getPlatform()): boolean {
  return !!getToken(platform) && !!getLogin(platform);
}

export function clearToken(platform: Platform = getPlatform()): void {
  const k = keys(platform);
  localStorage.removeItem(k.token);
  localStorage.removeItem(k.login);
  localStorage.removeItem(k.host);
}

/**
 * Validates a token against the platform and persists it (with the derived login and, for
 * self-hosted instances, the host). Makes the platform active on success.
 */
export async function saveToken(platform: Platform, token: string, host?: string): Promise<string> {
  const normalizedHost = host?.trim() ? host.trim().replace(/\/+$/, "") : undefined;
  let user: string;
  try {
    ({ user } = await getProvider(platform).validateToken(token, normalizedHost));
  } catch (e) {
    const label = platform === "gitlab" ? "GitLab" : "GitHub";
    if (e instanceof Error && /\b401\b/.test(e.message)) {
      throw new Error(`${label} rejected this token. Check that it is valid and not expired.`);
    }
    throw e instanceof Error ? e : new Error(`${label} validation failed`);
  }

  const k = keys(platform);
  localStorage.setItem(k.token, token);
  localStorage.setItem(k.login, user);
  if (normalizedHost) localStorage.setItem(k.host, normalizedHost);
  else localStorage.removeItem(k.host);
  setPlatform(platform);
  return user;
}
