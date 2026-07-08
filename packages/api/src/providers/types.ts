import type { PRCard, Platform } from "../types";

/** Credentials + endpoint for a single signed-in platform account. */
export interface ProviderContext {
  token: string;
  user: string;
  /** Base origin for self-hosted instances (e.g. https://gitlab.example.com). Omit for the platform's default host. */
  host?: string;
}

/**
 * A source of PR/MR cards for one platform. Implementations own their own
 * request caching and translate the platform's API into the shared PRCard model.
 */
export interface ReviewProvider {
  readonly platform: Platform;

  /** Validates a token against the platform and returns the derived login. */
  validateToken(token: string, host?: string): Promise<{ user: string }>;

  fetchPRs(
    ctx: ProviderContext,
    enabledRepos: string[],
    force: boolean,
    mergedRetentionDays: number,
  ): Promise<PRCard[]>;

  fetchOwnedRepos(ctx: ProviderContext, query: string): Promise<string[]>;

  invalidateCache(): void;
}
