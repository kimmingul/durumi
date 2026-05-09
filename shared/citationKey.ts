import type { BibEntry } from './bibtex';

/**
 * Deterministic citation-key generator for entries we mint from Crossref /
 * PubMed / etc. Shape: `{lastname}{year}{titleword}` lowercased ASCII, with
 * `a`/`b`/`c`… suffixes for collisions. Korean names go through Standard
 * Revised Romanization (RR) so a Crossref response with "김민걸" produces
 * `gim2024…` rather than something containing raw hangul (which Pandoc /
 * BibTeX can technically handle but most journal pipelines cannot).
 *
 * The function is pure: given the same `entry` and `existingKeys`, the same
 * key is returned every call. No randomness, no time.
 */
export interface MakeKeyOptions {
  /** Existing keys to avoid collisions with. Set or array — we accept both. */
  existingKeys?: ReadonlySet<string> | ReadonlyArray<string>;
}

export function makeCitationKey(entry: BibEntry, opts: MakeKeyOptions = {}): string {
  const author = firstAuthorLastName(entry.fields.author ?? entry.fields.editor ?? '');
  const year = extractYear(entry.fields.year ?? entry.fields.date ?? '');
  const word = firstSignificantTitleWord(entry.fields.title ?? '');
  const base = sanitizeKey(`${author}${year}${word}`);
  const fallback = base.length > 0 ? base : 'entry';

  const existing = toSet(opts.existingKeys);
  if (!existing.has(fallback)) return fallback;

  // Suffix `a`, `b`, … (skip past the bare key which is taken).
  for (let i = 0; i < 26; i++) {
    const candidate = `${fallback}${String.fromCharCode(97 + i)}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Pathological case: 26 collisions. Fall back to a numeric suffix.
  for (let i = 1; i < 1000; i++) {
    const candidate = `${fallback}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Truly degenerate; should never happen with real data.
  return `${fallback}-x`;
}

function toSet(input: ReadonlySet<string> | ReadonlyArray<string> | undefined): Set<string> {
  if (!input) return new Set();
  return input instanceof Set ? new Set(input) : new Set(input);
}

/**
 * Pulls the surname of the first author from a BibTeX `author` field.
 * Handles both `Last, First` and `First Last`, and the multi-author
 * `A and B and C` separator.
 */
export function firstAuthorLastName(raw: string): string {
  if (!raw) return '';
  const first = raw.split(/\s+and\s+/i)[0]!.trim();
  if (!first) return '';
  if (first.includes(',')) {
    return first.split(',')[0]!.trim();
  }
  // For "First Middle Last" the surname is the last whitespace-separated
  // token. For Korean "김민걸" (no space) the whole token IS the name; we
  // take the first syllable as the surname (Korean surnames are 1 syllable
  // in 99%+ of cases; the rare 2-syllable surnames like 남궁/제갈 will
  // collapse to 1, which is acceptable for a citation-key heuristic).
  if (containsHangul(first)) {
    return first[0]!;
  }
  const tokens = first.split(/\s+/);
  return tokens[tokens.length - 1]!;
}

/**
 * Skip common stopwords and return the first content-bearing word in the
 * title, lowercased and stripped of punctuation. Used as the third segment
 * of the citation key.
 */
export function firstSignificantTitleWord(raw: string): string {
  if (!raw) return '';
  const STOPWORDS = new Set([
    'a', 'an', 'the',
    'of', 'on', 'in', 'at', 'to', 'for', 'from', 'by', 'with',
    'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  ]);
  const tokens = raw
    .split(/[\s\-—–:;,.!?]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const lc = token.toLowerCase();
    if (STOPWORDS.has(lc)) continue;
    return token;
  }
  return tokens[0] ?? '';
}

function extractYear(raw: string): string {
  const m = raw.match(/\d{4}/);
  return m ? m[0] : '';
}

/**
 * Reduce arbitrary Unicode → BibTeX-safe ASCII for citation keys. Steps:
 *  1. Romanize Hangul via Standard RR.
 *  2. NFD-decompose Latin so Š / é / ß lose their diacritics.
 *  3. Drop everything that isn't `[a-z0-9]`.
 */
export function sanitizeKey(raw: string): string {
  if (!raw) return '';
  const romanized = romanizeHangul(raw);
  const stripped = romanized
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return stripped.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Hangul → Latin via the Revised Romanization of Korean (2000). Operates per
 * syllable block (U+AC00..U+D7A3); non-Hangul chars pass through unchanged.
 *
 * For citation-key purposes we transliterate each syllable independently and
 * skip the optional sound-rule contractions (e.g. `ㄱ + ㄴ → ngn`) because:
 *   1. Cite keys want determinism, not phonetic perfection.
 *   2. Linking rules require dictionary lookups for irregular cases.
 *   3. The result is still recognisable to a Korean reader.
 */
export function romanizeHangul(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += romanizeSyllable(code);
    } else {
      out += ch;
    }
  }
  return out;
}

const RR_INITIAL: ReadonlyArray<string> = [
  // 0..18 — Standard RR for syllable-initial position.
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];

const RR_MEDIAL: ReadonlyArray<string> = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

const RR_FINAL: ReadonlyArray<string> = [
  // 0 = no final consonant. 1..27 follow the canonical ordering. We use the
  // RR's representative letter for each ending, which differs from the
  // initial-position letter for some jamo (e.g. ㄹ is "r" initially, "l" at
  // syllable end). Multi-letter clusters (ㄳ, ㄵ, ㄺ, …) collapse to the
  // dominant sound for cite-key purposes.
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

function romanizeSyllable(code: number): string {
  const offset = code - 0xac00;
  const initialIdx = Math.floor(offset / 588);
  const medialIdx = Math.floor((offset % 588) / 28);
  const finalIdx = offset % 28;
  return (
    (RR_INITIAL[initialIdx] ?? '') +
    (RR_MEDIAL[medialIdx] ?? '') +
    (RR_FINAL[finalIdx] ?? '')
  );
}

function containsHangul(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7a3) return true;
  }
  return false;
}
