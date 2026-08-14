/**
 * Clusters cards by `repo`, ordering clusters alphabetically by repo full
 * name. Cards keep their relative order within their cluster — grouping
 * only clusters, it never re-sorts within a repo.
 */
export function groupCardsByRepo<T extends { repo: string }>(cards: T[]): T[] {
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
