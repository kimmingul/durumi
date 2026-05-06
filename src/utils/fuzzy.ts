/**
 * Tiny fzf-style fuzzy matcher. Returns a score (higher = better) plus the
 * indices into `target` that matched, or null when the query characters don't
 * appear in order. The scorer mirrors the rough heuristics fzf uses:
 *   - +16 per matched character.
 *   - +12 bonus when the character is at a word boundary (start, after `/`,
 *     `_`, `-`, or `.`).
 *   - +8  bonus for consecutive matches (rewards tight runs).
 *   - -1  per character of distance between consecutive matches (rewards
 *     compactness).
 *   - +20 if the match begins at the start of the basename.
 *   - +5  per missing character that is *before* the first match (so deeper
 *     matches in long paths are penalised).
 */
export interface FuzzyResult {
  score: number;
  indices: number[];
}

const BOUND_CHARS = new Set([' ', '/', '_', '-', '.', '\\']);

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (query.length === 0) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let qi = 0;
  let lastMatch = -1;
  const indices: number[] = [];
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    indices.push(i);
    score += 16;
    const prev = i > 0 ? t[i - 1] : '';
    if (i === 0 || BOUND_CHARS.has(prev)) score += 12;
    if (lastMatch === i - 1) score += 8;
    if (lastMatch !== -1) score -= i - lastMatch - 1;
    lastMatch = i;
    qi++;
  }
  if (qi < q.length) return null;
  // Bonus when the first matched index sits at the start of the basename.
  const baseStart = lastSlash(target) + 1;
  if (indices[0] === baseStart) score += 20;
  // Penalise leading skip distance.
  score -= indices[0] * 1.5;
  return { score, indices };
}

function lastSlash(s: string): number {
  let i = s.length - 1;
  while (i >= 0 && s[i] !== '/' && s[i] !== '\\') i--;
  return i;
}

export interface ScoredItem<T> {
  item: T;
  score: number;
  indices: number[];
}

/**
 * Convenience helper that scores every item in `items`, drops the misses, and
 * sorts by descending score (ties broken by the item's natural order).
 */
export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
): ScoredItem<T>[] {
  if (query.length === 0) {
    return items.map((item, i) => ({ item, score: -i, indices: [] }));
  }
  const out: ScoredItem<T>[] = [];
  for (const item of items) {
    const r = fuzzyMatch(query, getText(item));
    if (r) out.push({ item, score: r.score, indices: r.indices });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
