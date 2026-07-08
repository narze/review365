/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Bounded so per-PR
 * enrichment calls (reviews, approvals) don't fire dozens of requests in one burst
 * and trip provider rate limits, while still running far faster than a serial loop.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
