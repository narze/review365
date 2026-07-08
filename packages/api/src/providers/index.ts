import type { Platform } from "../types";
import type { ReviewProvider } from "./types";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";

export type { ProviderContext, ReviewProvider } from "./types";

const PROVIDERS: Record<Platform, ReviewProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function getProvider(platform: Platform): ReviewProvider {
  return PROVIDERS[platform];
}
