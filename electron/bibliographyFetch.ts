import type { BibEntry } from '@shared/bibtex';

/**
 * Outbound HTTP for the bibliography feature. All network calls live in main
 * (never the renderer) so we keep the renderer security-isolated and the
 * Crossref/NCBI User-Agent + API-key plumbing in one place.
 *
 * v0.1.6 Track A: DOI → BibEntry via Crossref's `/works/{doi}` JSON. The
 * keyword search (Crossref + PubMed) and KoreaMed/ORCID resolvers land in
 * Tracks B and C — they will reuse `httpJson` + `crossrefMessageToEntry`.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DURUMI_VERSION = '0.1.6';

export interface FetchOptions {
  /** Crossref polite-pool email (optional but recommended). */
  email?: string | null;
  /** NCBI E-utilities API key (Track B; ignored here). */
  ncbiApiKey?: string | null;
  /** Abort the request after this many ms. Default 10s. */
  timeoutMs?: number;
  /** Inject a custom fetcher (used by tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface FetchError {
  ok: false;
  /** One of: `not-found`, `network`, `parse`, `timeout`, `rate-limit`. */
  code: 'not-found' | 'network' | 'parse' | 'timeout' | 'rate-limit' | 'http';
  message: string;
}

export interface FetchSuccess<T> {
  ok: true;
  data: T;
}

export type FetchResult<T> = FetchSuccess<T> | FetchError;

/**
 * Resolve a DOI to a `BibEntry` via Crossref. The DOI may be passed as a bare
 * `10.xxxx/yyyy`, a `https://doi.org/...` URL, or with a `doi:` prefix —
 * `normalizeDoi` strips all of those.
 */
export async function resolveDOI(
  doi: string,
  opts: FetchOptions = {},
): Promise<FetchResult<BibEntry>> {
  const clean = normalizeDoi(doi);
  if (!clean) {
    return { ok: false, code: 'parse', message: 'invalid DOI' };
  }
  const url = `https://api.crossref.org/works/${encodeURIComponent(clean)}`;
  const result = await httpJson<{ message: CrossrefMessage }>(url, opts);
  if (!result.ok) return result;
  try {
    return { ok: true, data: crossrefMessageToEntry(result.data.message) };
  } catch (err) {
    return {
      ok: false,
      code: 'parse',
      message: err instanceof Error ? err.message : 'parse failed',
    };
  }
}

/**
 * `10.1056/NEJMoa1234567` ← any of the spellings users paste:
 *  - `https://doi.org/10.1056/NEJMoa1234567`
 *  - `https://dx.doi.org/10.1056/NEJMoa1234567`
 *  - `doi:10.1056/NEJMoa1234567`
 *  - `DOI 10.1056/NEJMoa1234567`
 *  - bare `10.1056/NEJMoa1234567`
 *
 * Returns null when the input doesn't look like a DOI at all, so the caller
 * can show a `'invalid DOI'` error instead of querying Crossref blindly.
 */
export function normalizeDoi(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Strip "doi:" / "DOI " prefixes and any URL prefix.
  const stripped = trimmed
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi[\s:]+/i, '')
    .trim();
  // DOI shape per the Crossref handbook: `10.<registrant>/<suffix>`. The
  // suffix is permissive (almost any printable character); we just require
  // a non-empty value after the slash.
  if (!/^10\.\d{4,9}\/\S+$/.test(stripped)) return null;
  return stripped;
}

/**
 * Compact representation of the Crossref Works message. Only the fields the
 * BibTeX writer actually consumes are typed — everything else is ignored.
 */
export interface CrossrefMessage {
  DOI?: string;
  type?: string;
  title?: string[];
  author?: Array<{ family?: string; given?: string; name?: string }>;
  editor?: Array<{ family?: string; given?: string; name?: string }>;
  'container-title'?: string[];
  publisher?: string;
  volume?: string;
  issue?: string;
  page?: string;
  issued?: { 'date-parts'?: number[][] };
  published?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  URL?: string;
  ISSN?: string[];
  ISBN?: string[];
  abstract?: string;
}

/**
 * Best-effort mapping of the Crossref response shape to a BibTeX entry.
 * Designed to round-trip cleanly through `parseBibTeX` → `formatEntry`.
 */
export function crossrefMessageToEntry(msg: CrossrefMessage): BibEntry {
  const type = mapCrossrefType(msg.type);
  const fields: Record<string, string> = {};

  const authors = formatPersonList(msg.author ?? []);
  if (authors) fields.author = authors;
  if ((!authors || authors.length === 0) && msg.editor && msg.editor.length > 0) {
    fields.editor = formatPersonList(msg.editor);
  }

  const title = pickFirstNonEmpty(msg.title);
  if (title) fields.title = title;

  const container = pickFirstNonEmpty(msg['container-title']);
  if (container) {
    if (type === 'incollection' || type === 'inbook') fields.booktitle = container;
    else fields.journal = container;
  }

  if (msg.publisher) fields.publisher = msg.publisher;
  if (msg.volume) fields.volume = msg.volume;
  if (msg.issue) fields.number = msg.issue;
  if (msg.page) fields.pages = normalizePages(msg.page);

  const year = pickYear(msg);
  if (year) fields.year = year;

  if (msg.DOI) fields.doi = msg.DOI;
  if (msg.URL) fields.url = msg.URL;
  if (msg.ISSN && msg.ISSN.length > 0) fields.issn = msg.ISSN[0]!;
  if (msg.ISBN && msg.ISBN.length > 0) fields.isbn = msg.ISBN[0]!;
  // Crossref abstracts are JATS XML — strip tags so the BibTeX file stays
  // human-readable. Pandoc does its own abstract handling at export time.
  if (msg.abstract) fields.abstract = stripTags(msg.abstract);

  return {
    // Empty placeholder — caller (`bibliographyStore.addEntry`) assigns a
    // real key via `makeCitationKey` once it can see `existingKeys`.
    key: '',
    type,
    fields,
  };
}

function mapCrossrefType(type: string | undefined): string {
  switch (type) {
    case 'journal-article': return 'article';
    case 'proceedings-article': return 'inproceedings';
    case 'book': return 'book';
    case 'monograph': return 'book';
    case 'edited-book': return 'book';
    case 'book-chapter': return 'incollection';
    case 'book-section': return 'incollection';
    case 'reference-book': return 'book';
    case 'dissertation': return 'phdthesis';
    case 'report': return 'techreport';
    case 'posted-content': return 'unpublished';
    default: return 'misc';
  }
}

function pickFirstNonEmpty(arr: readonly string[] | undefined): string | null {
  if (!arr) return null;
  for (const s of arr) {
    const trimmed = (s ?? '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function formatPersonList(
  people: ReadonlyArray<{ family?: string; given?: string; name?: string }>,
): string {
  const parts: string[] = [];
  for (const p of people) {
    const family = (p.family ?? '').trim();
    const given = (p.given ?? '').trim();
    if (family && given) {
      parts.push(`${family}, ${given}`);
    } else if (family) {
      parts.push(family);
    } else if (p.name) {
      // "name" is used for organizational authors — wrap in braces so BibTeX
      // doesn't try to split it as "First Last".
      parts.push(`{${p.name.trim()}}`);
    }
  }
  return parts.join(' and ');
}

function normalizePages(p: string): string {
  // Crossref returns "234-241" or sometimes "234"; BibTeX convention is
  // "234--241" but biber tolerates either. Keep what we got but collapse
  // whitespace.
  return p.replace(/\s+/g, '');
}

function pickYear(msg: CrossrefMessage): string {
  const candidates = [
    msg.issued?.['date-parts']?.[0]?.[0],
    msg['published-print']?.['date-parts']?.[0]?.[0],
    msg['published-online']?.['date-parts']?.[0]?.[0],
    msg.published?.['date-parts']?.[0]?.[0],
  ];
  for (const y of candidates) {
    if (typeof y === 'number' && y >= 1000 && y <= 9999) return String(y);
  }
  return '';
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Generic JSON GET with timeout + structured error reporting. Used by every
 * outbound HTTP call in v0.1.6+. Crossref's polite-pool convention encodes
 * the contact email into the User-Agent (no separate header).
 */
export async function httpJson<T>(
  url: string,
  opts: FetchOptions,
): Promise<FetchResult<T>> {
  const fetcher = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { ok: false, code: 'network', message: 'fetch is unavailable' };
  }
  const ua = buildUserAgent(opts.email);
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetcher(url, {
      method: 'GET',
      headers: { 'User-Agent': ua, 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (r.status === 404) {
      return { ok: false, code: 'not-found', message: '404 not found' };
    }
    if (r.status === 429) {
      return { ok: false, code: 'rate-limit', message: 'rate limited' };
    }
    if (!r.ok) {
      return {
        ok: false,
        code: 'http',
        message: `HTTP ${r.status} ${r.statusText}`.trim(),
      };
    }
    let json: unknown;
    try {
      json = await r.json();
    } catch (err) {
      return {
        ok: false,
        code: 'parse',
        message: err instanceof Error ? err.message : 'json parse failed',
      };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      return { ok: false, code: 'timeout', message: `timeout after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      code: 'network',
      message: err instanceof Error ? err.message : 'network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildUserAgent(email: string | null | undefined): string {
  const base = `Durumi/${DURUMI_VERSION} (https://github.com/kimmingul/durumi)`;
  return email ? `${base} mailto:${email}` : base;
}
