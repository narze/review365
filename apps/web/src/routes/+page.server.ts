import { DEFAULT_CONFIG } from "@review365/api/types";
import { client } from "$lib/orpc";

export async function load() {
  try {
    const data = await client.prs.list({ force: false });
    return {
      columns: data.columns,
      cards: data.cards,
      enabledRepos: data.enabledRepos,
      rules: data.rules,
      orphans: data.orphans,
      signalLabels: data.signalLabels,
      mergedRetentionDays: data.mergedRetentionDays,
    };
  } catch {
    return {
      columns: DEFAULT_CONFIG.columns,
      cards: [],
      enabledRepos: [],
      rules: DEFAULT_CONFIG.rules,
      orphans: [],
      signalLabels: {},
      mergedRetentionDays: DEFAULT_CONFIG.mergedRetentionDays ?? 14,
    };
  }
}
