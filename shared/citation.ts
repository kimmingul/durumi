import type { BibEntry } from './bibtex';

/**
 * Renders BibTeX entries into Vancouver-style numbered citations (the format
 * the majority of clinical journals require). One day this can grow into a
 * style switch via CSL JSON, but ~80% of medical use is Vancouver.
 *
 *   1. Smith J, Doe A. Title of paper. NEJM. 2023;388(12):1101-1110.
 *      doi:10.1056/NEJMoa1234567
 */
export interface FormattedCitation {
  /** 1-based reference number assigned in citation order. */
  number: number;
  /** The bibliography entry this number refers to. */
  entry: BibEntry;
  /** Pre-rendered HTML for the bibliography list item (no `<li>` wrapper). */
  html: string;
}

/**
 * Walks the markdown source and returns the citation keys in the order they
 * are first cited, plus a map from each key to its assigned reference number.
 *
 * Pandoc syntax recognised:
 *   [@key]                       single
 *   [@key, p. 33]                with locator (locator preserved as suffix)
 *   [@a; @b; @c]                 grouped, in document order
 *   [-@key]                      author-suppressing form, treated identically
 *
 * Bare `@key` (without brackets) is intentionally ignored to keep things
 * predictable around emails and `:emoji:`-adjacent positions.
 */
const CITATION_BLOCK_RE = /\[(-?@[^\]]+)\]/g;
const KEY_IN_BLOCK_RE = /-?@([A-Za-z0-9_:.\-+/]+)/g;

export function collectCitationKeys(markdown: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(CITATION_BLOCK_RE)) {
    const inner = m[1];
    for (const k of inner.matchAll(KEY_IN_BLOCK_RE)) {
      const key = k[1];
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  return order;
}

/**
 * Replaces every `[@key]` (or `[@a; @b]`) occurrence in `markdown` with a
 * numbered marker like `[1]` or `[1,2]`. Unknown keys are emitted as `[?]`
 * with their key shown in a tooltip-friendly span.
 */
export function applyCitations(
  markdown: string,
  numberMap: Map<string, number>,
): string {
  return markdown.replace(CITATION_BLOCK_RE, (_, inner: string) => {
    const numbers: string[] = [];
    let unknown = false;
    for (const k of inner.matchAll(KEY_IN_BLOCK_RE)) {
      const key = k[1];
      const num = numberMap.get(key);
      if (num !== undefined) {
        numbers.push(`<a href="#ref-${escapeHref(key)}" class="citation-ref">${num}</a>`);
      } else {
        unknown = true;
        numbers.push(`<span class="citation-missing" title="missing: ${escapeAttr(key)}">?</span>`);
      }
    }
    return `<sup class="citation${unknown ? ' has-missing' : ''}">[${numbers.join(',')}]</sup>`;
  });
}

export function formatBibliography(
  keysInOrder: readonly string[],
  index: ReadonlyMap<string, BibEntry>,
): FormattedCitation[] {
  const out: FormattedCitation[] = [];
  let n = 1;
  for (const key of keysInOrder) {
    const entry = index.get(key);
    if (!entry) continue;
    out.push({ number: n, entry, html: formatEntry(entry) });
    n++;
  }
  return out;
}

function formatEntry(entry: BibEntry): string {
  const f = entry.fields;
  const parts: string[] = [];
  const author = formatAuthors(f.author ?? f.editor ?? '');
  if (author) parts.push(esc(author) + '.');
  if (f.title) parts.push(esc(stripTrailingDot(f.title)) + '.');
  // Journal article vs. book/chapter — pick the most informative pieces.
  if (f.journal) {
    let jp = `<em>${esc(stripTrailingDot(f.journal))}</em>`;
    if (f.year) jp += `. ${esc(f.year)}`;
    if (f.volume) jp += `;${esc(f.volume)}`;
    if (f.number) jp += `(${esc(f.number)})`;
    if (f.pages) jp += `:${esc(formatPages(f.pages))}`;
    parts.push(jp + '.');
  } else if (f.booktitle) {
    let bp = `In: <em>${esc(stripTrailingDot(f.booktitle))}</em>`;
    if (f.publisher) bp += `. ${esc(f.publisher)}`;
    if (f.year) bp += `; ${esc(f.year)}`;
    if (f.pages) bp += `:${esc(formatPages(f.pages))}`;
    parts.push(bp + '.');
  } else {
    if (f.publisher) parts.push(esc(f.publisher) + (f.year ? `; ${esc(f.year)}.` : '.'));
    else if (f.year) parts.push(esc(f.year) + '.');
  }
  if (f.doi) {
    const doi = esc(f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, ''));
    parts.push(`doi:<a href="https://doi.org/${doi}" class="citation-doi">${doi}</a>`);
  } else if (f.url) {
    const url = esc(f.url);
    parts.push(`<a href="${url}" class="citation-url">${url}</a>`);
  }
  return parts.join(' ');
}

function formatAuthors(raw: string): string {
  if (!raw) return '';
  const authors = raw.split(/\s+and\s+/).map(formatOneAuthor).filter(Boolean);
  if (authors.length === 0) return '';
  if (authors.length > 6) return authors.slice(0, 6).join(', ') + ', et al';
  return authors.join(', ');
}

function formatOneAuthor(name: string): string {
  // BibTeX names are either "Last, First Middle" or "First Middle Last".
  const trimmed = name.trim();
  if (!trimmed) return '';
  let last = '';
  let firsts = '';
  if (trimmed.includes(',')) {
    const [l, ...rest] = trimmed.split(',');
    last = l.trim();
    firsts = rest.join(',').trim();
  } else {
    const tokens = trimmed.split(/\s+/);
    last = tokens[tokens.length - 1] ?? '';
    firsts = tokens.slice(0, -1).join(' ');
  }
  const initials = firsts
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return last + (initials ? ` ${initials}` : '');
}

function formatPages(pages: string): string {
  // BibTeX often uses `--` or `-`; Vancouver collapses to `1101-10` style.
  return pages.replace(/\s*--\s*/g, '-').replace(/\s+/g, '');
}

function stripTrailingDot(s: string): string {
  return s.replace(/\.\s*$/, '');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return esc(s);
}

function escapeHref(s: string): string {
  return encodeURIComponent(s);
}
