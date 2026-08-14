import type { PRCard } from "@review365/api/types";

// Fields joined with a newline so a search term can never straddle two fields
// (e.g. the end of a title and the start of an author) and produce a phantom
// match. The PR number is prefixed with `#` so both `123` and `#123` find it.
function haystack(card: PRCard): string {
  return [card.title, card.author, card.repo, `#${card.prNumber}`, card.note ?? ""]
    .join("\n")
    .toLowerCase();
}

/**
 * True when a card matches a free-text query. Matching is a case-insensitive
 * substring test across the card's title, author, repo, PR number, and note.
 * Whitespace-separated terms are ANDed — every term must hit some field, so
 * `narze auth` finds a card authored by narze whose title mentions auth. An
 * empty (or whitespace-only) query matches every card.
 */
export function cardMatchesQuery(card: PRCard, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(card);
  return terms.every((term) => text.includes(term));
}

/** Keeps only the cards matching the query, preserving input order. */
export function filterCardsByQuery(cards: PRCard[], query: string): PRCard[] {
  if (!query.trim()) return cards;
  return cards.filter((card) => cardMatchesQuery(card, query));
}
