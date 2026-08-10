// PROTOTYPE helpers — local copies kept next to this throwaway route rather
// than the real `$lib`, since the real `groupCardsByRepo` (proposed in
// docs/superpowers/plans/2026-08-10-column-group-by-repo.md, Task 1) doesn't
// exist until that plan is executed. Delete alongside the rest of this route.

/** Clusters cards by `repo`, alphabetical by repo name, order preserved within a cluster. */
export function groupByRepo<T extends { repo: string }>(cards: T[]): T[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const card of cards) {
    let bucket = buckets.get(card.repo);
    if (!bucket) {
      bucket = [];
      buckets.set(card.repo, bucket);
      order.push(card.repo);
    }
    bucket.push(card);
  }
  return [...order].sort((a, b) => a.localeCompare(b)).flatMap((repo) => buckets.get(repo)!);
}

export const REPO_PALETTE = [
  { border: "border-l-blue-500", dot: "bg-blue-500" },
  { border: "border-l-purple-500", dot: "bg-purple-500" },
  { border: "border-l-teal-500", dot: "bg-teal-500" },
  { border: "border-l-amber-500", dot: "bg-amber-500" },
  { border: "border-l-rose-500", dot: "bg-rose-500" },
] as const;

export function paletteForRepo(repos: string[], repo: string) {
  const idx = repos.indexOf(repo);
  return REPO_PALETTE[idx % REPO_PALETTE.length];
}
