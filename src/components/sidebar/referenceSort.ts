import type { BibEntry } from '@shared/bibtex';
import { firstAuthorLastName } from '@shared/citationKey';

/**
 * Right-sidebar references-tab sort keys. Mirrors
 * `Preferences.bibliography.sortBy` in `shared/ipc-contract.ts` — keep both in
 * sync if the union grows.
 */
export type SortBy =
  | 'addedDesc'
  | 'addedAsc'
  | 'author'
  | 'yearDesc'
  | 'yearAsc'
  | 'key'
  | 'citationOrder'
  | 'unused';

export interface SortContext {
  /** Active document body. Used for `citationOrder` / `unused`. */
  docText: string;
  /**
   * Order in which each entry was appended to the .bib file (0-based).
   * Derived from the bibliography store's `entries` order, which itself
   * mirrors append order from disk. Entries missing from the map are
   * treated as having "unknown" order and pushed to the end.
   */
  appendIndex: Map<string, number>;
}

/**
 * Stable, total-order sort of the visible reference list.
 *
 * The function is pure — it returns a new array and never mutates inputs —
 * so the React side can wrap it in `useMemo` without worrying about identity
 * leakage. Comparators always tie-break by `key` A-to-Z to keep the order
 * deterministic across renders.
 */
export function sortReferences(
  entries: BibEntry[],
  sortBy: SortBy,
  ctx: SortContext,
): BibEntry[] {
  const next = entries.slice();
  switch (sortBy) {
    case 'addedAsc':
      next.sort(compareAppend(ctx.appendIndex, 1));
      return next;
    case 'addedDesc':
      next.sort(compareAppend(ctx.appendIndex, -1));
      return next;
    case 'author':
      next.sort((a, b) => {
        const an = authorKey(a);
        const bn = authorKey(b);
        const c = compareEmptyLast(an, bn);
        if (c !== 0) return c;
        return compareKey(a, b);
      });
      return next;
    case 'yearDesc':
    case 'yearAsc': {
      const dir = sortBy === 'yearAsc' ? 1 : -1;
      next.sort((a, b) => {
        const ay = parseYear(a.fields.year);
        const by = parseYear(b.fields.year);
        // null/unknown always last regardless of direction.
        if (ay === null && by === null) return compareKey(a, b);
        if (ay === null) return 1;
        if (by === null) return -1;
        if (ay !== by) return (ay - by) * dir;
        return compareKey(a, b);
      });
      return next;
    }
    case 'key':
      next.sort(compareKey);
      return next;
    case 'citationOrder': {
      const order = firstCitationOffsets(ctx.docText, next);
      next.sort((a, b) => {
        const ao = order.get(a.key);
        const bo = order.get(b.key);
        // Uncited entries to the end, ordered by addedDesc fallback.
        if (ao === undefined && bo === undefined) {
          return compareAppend(ctx.appendIndex, -1)(a, b);
        }
        if (ao === undefined) return 1;
        if (bo === undefined) return -1;
        if (ao !== bo) return ao - bo;
        return compareKey(a, b);
      });
      return next;
    }
    case 'unused': {
      const counts = citationCounts(ctx.docText, next);
      next.sort((a, b) => {
        const ac = counts.get(a.key) ?? 0;
        const bc = counts.get(b.key) ?? 0;
        const aUn = ac === 0 ? 0 : 1;
        const bUn = bc === 0 ? 0 : 1;
        if (aUn !== bUn) return aUn - bUn; // uncited (0) first
        return compareAppend(ctx.appendIndex, -1)(a, b);
      });
      return next;
    }
  }
}

function compareAppend(
  appendIndex: Map<string, number>,
  dir: 1 | -1,
): (a: BibEntry, b: BibEntry) => number {
  return (a, b) => {
    const ai = appendIndex.get(a.key);
    const bi = appendIndex.get(b.key);
    if (ai === undefined && bi === undefined) return compareKey(a, b);
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    if (ai !== bi) return (ai - bi) * dir;
    return compareKey(a, b);
  };
}

function compareKey(a: BibEntry, b: BibEntry): number {
  return a.key.localeCompare(b.key);
}

function compareEmptyLast(a: string, b: string): number {
  const aEmpty = a.length === 0;
  const bEmpty = b.length === 0;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return a.localeCompare(b);
}

function authorKey(e: BibEntry): string {
  return firstAuthorLastName(e.fields.author ?? e.fields.editor ?? '').toLowerCase();
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /(\d{4})/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Record the byte offset of the first `[@key]` occurrence for every entry.
 * Avoids quadratic scans on large libraries because each entry's lookup
 * short-circuits on the first match.
 */
function firstCitationOffsets(
  docText: string,
  entries: BibEntry[],
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (!docText || entries.length === 0) return offsets;
  for (const e of entries) {
    const idx = findCitationOffset(docText, e.key);
    if (idx >= 0) offsets.set(e.key, idx);
  }
  return offsets;
}

function citationCounts(
  docText: string,
  entries: BibEntry[],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!docText || entries.length === 0) {
    for (const e of entries) counts.set(e.key, 0);
    return counts;
  }
  for (const e of entries) {
    counts.set(e.key, countCitationMatches(docText, e.key));
  }
  return counts;
}

/**
 * Find the first `[@key]` occurrence in the document. Accepts Pandoc's
 * citation syntax — `,`, `;`, `]`, whitespace, or EOL count as terminators
 * so multi-cite groups like `[@a; @b]` are recognised.
 */
function findCitationOffset(doc: string, key: string): number {
  const needle = `@${key}`;
  let from = 0;
  while (from < doc.length) {
    const i = doc.indexOf(needle, from);
    if (i < 0) return -1;
    if (isCitationMatch(doc, i, key)) return i;
    from = i + 1;
  }
  return -1;
}

function countCitationMatches(doc: string, key: string): number {
  const needle = `@${key}`;
  let count = 0;
  let from = 0;
  while (from < doc.length) {
    const i = doc.indexOf(needle, from);
    if (i < 0) break;
    if (isCitationMatch(doc, i, key)) count++;
    from = i + needle.length;
  }
  return count;
}

/**
 * Verify that the `@key` at `pos` is a real citation token. The match is
 * valid if (a) the next char is a citation terminator (not a key-char
 * continuation, so `@smith` does not match `@smith2023`) and (b) the `@` is
 * inside a `[...]` group. We don't fully parse Pandoc — a simple "preceded
 * by `[` on this line" check is good enough for sort ordering.
 */
function isCitationMatch(doc: string, atPos: number, key: string): boolean {
  const after = doc[atPos + 1 + key.length];
  if (after !== undefined && /[A-Za-z0-9_:.\-+]/.test(after)) return false;
  for (let i = atPos - 1; i >= 0 && i >= atPos - 200; i--) {
    const ch = doc[i]!;
    if (ch === '[') return true;
    if (ch === '\n') return false;
  }
  return false;
}
