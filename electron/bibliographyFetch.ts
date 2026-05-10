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

export interface SearchHit {
  /** Pre-mapped `BibEntry`. The `key` field is empty — minted on append. */
  entry: BibEntry;
  /** Source-provided ID for de-dup (DOI for Crossref, PMID for PubMed). */
  externalId: string;
  /** `'crossref'`, `'pubmed'`, or `'koreamed'` (Track C). */
  source: 'crossref' | 'pubmed' | 'koreamed';
}

/**
 * Crossref keyword search. The `query` is sent verbatim — Crossref's matcher
 * handles author/title/journal mixing internally. Cap at 25 hits to keep
 * the network round-trip under a second on a typical connection.
 */
export async function searchCrossref(
  query: string,
  opts: FetchOptions & { limit?: number } = {},
): Promise<FetchResult<SearchHit[]>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  const limit = clampLimit(opts.limit, 25);
  const params = new URLSearchParams({
    query: trimmed,
    rows: String(limit),
    select:
      'DOI,title,author,container-title,volume,issue,page,issued,published-print,published-online,type,publisher,URL,ISSN,abstract',
  });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const result = await httpJson<{ message: { items: CrossrefMessage[] } }>(url, opts);
  if (!result.ok) return result;
  try {
    const items = result.data.message.items ?? [];
    const hits: SearchHit[] = items.map((m) => ({
      entry: crossrefMessageToEntry(m),
      externalId: m.DOI ?? '',
      source: 'crossref' as const,
    }));
    return { ok: true, data: hits };
  } catch (err) {
    return {
      ok: false,
      code: 'parse',
      message: err instanceof Error ? err.message : 'parse failed',
    };
  }
}

/**
 * PubMed search via NCBI E-utilities. Two-step: ESearch → list of PMIDs,
 * then ESummary → metadata for each. We deliberately use the JSON shape of
 * ESummary (`retmode=json`) rather than ESearch's XML so the renderer-side
 * parsing stays trivial. NCBI's polite policy: no more than 3 requests/sec
 * without an API key, 10/sec with one.
 */
export async function searchPubMed(
  query: string,
  opts: FetchOptions & { limit?: number } = {},
): Promise<FetchResult<SearchHit[]>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  const limit = clampLimit(opts.limit, 25);
  const apiKey = (opts.ncbiApiKey ?? '').trim();
  const baseParams = new URLSearchParams({
    db: 'pubmed',
    retmode: 'json',
    retmax: String(limit),
    sort: 'relevance',
    term: trimmed,
  });
  if (apiKey) baseParams.set('api_key', apiKey);

  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${baseParams.toString()}`;
  const idsResult = await httpJson<EsearchResponse>(searchUrl, opts);
  if (!idsResult.ok) return idsResult;
  const ids = idsResult.data.esearchresult?.idlist ?? [];
  if (ids.length === 0) return { ok: true, data: [] };

  const summaryParams = new URLSearchParams({
    db: 'pubmed',
    retmode: 'json',
    id: ids.join(','),
  });
  if (apiKey) summaryParams.set('api_key', apiKey);
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams.toString()}`;
  const summaryResult = await httpJson<EsummaryResponse>(summaryUrl, opts);
  if (!summaryResult.ok) return summaryResult;

  const result = summaryResult.data.result ?? {};
  const uids = (result.uids as string[] | undefined) ?? ids;
  const hits: SearchHit[] = [];
  for (const uid of uids) {
    const item = result[uid];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = pubmedSummaryToEntry(item as PubmedSummaryItem, uid);
    hits.push({ entry, externalId: uid, source: 'pubmed' });
  }
  return { ok: true, data: hits };
}

interface EsearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface EsummaryResponse {
  result?: Record<string, unknown> & { uids?: string[] };
}

interface PubmedSummaryItem {
  title?: string;
  authors?: Array<{ name?: string; authtype?: string }>;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
  pubtype?: string[];
}

/**
 * Map an ESummary item to a `BibEntry`. Captures DOI when present (PubMed
 * carries it in `articleids[].idtype === 'doi'`), preserves the PMID, and
 * renders `pubdate` as a 4-digit year.
 */
export function pubmedSummaryToEntry(item: PubmedSummaryItem, pmid: string): BibEntry {
  const fields: Record<string, string> = {};
  if (item.title) fields.title = stripTrailingPeriod(stripTags(item.title));
  if (item.authors && item.authors.length > 0) {
    fields.author = item.authors
      .filter((a) => a.name && (!a.authtype || a.authtype === 'Author'))
      .map((a) => normalizePubmedAuthor(a.name!))
      .join(' and ');
  }
  const journal = item.fulljournalname ?? item.source;
  if (journal) fields.journal = journal;
  if (item.volume) fields.volume = item.volume;
  if (item.issue) fields.number = item.issue;
  if (item.pages) fields.pages = item.pages;
  const year = extractPubmedYear(item.pubdate);
  if (year) fields.year = year;

  for (const aid of item.articleids ?? []) {
    if (aid.idtype === 'doi' && aid.value) fields.doi = aid.value;
  }
  fields.pmid = pmid;

  const type = mapPubmedType(item.pubtype);
  return { key: '', type, fields };
}

function normalizePubmedAuthor(name: string): string {
  // PubMed gives "Last FM" — convert to BibTeX's "Last, FM" so the parser
  // and Pandoc reliably recognise the family / given split.
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return name.trim();
  const last = tokens.slice(0, -1).join(' ');
  const initials = tokens[tokens.length - 1]!;
  return `${last}, ${initials}`;
}

function extractPubmedYear(pubdate: string | undefined): string {
  if (!pubdate) return '';
  const m = pubdate.match(/\d{4}/);
  return m ? m[0] : '';
}

function mapPubmedType(types: string[] | undefined): string {
  if (!types || types.length === 0) return 'article';
  for (const t of types) {
    if (/journal article|review|case reports|clinical trial/i.test(t)) return 'article';
    if (/book chapter/i.test(t)) return 'incollection';
    if (/book/i.test(t)) return 'book';
  }
  return 'article';
}

function stripTrailingPeriod(s: string): string {
  return s.replace(/\.\s*$/, '');
}

function clampLimit(n: number | undefined, def: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return def;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

/**
 * KoreaMed search via HTML scraping — the official OpenAPI is intermittent
 * and `koreamed.org/SearchBasic.php` is the de-facto stable surface. We fetch
 * the HTML page and extract entries via a small purpose-built parser. The
 * design's product decision is "develop direct web search if the API
 * proves unstable" — this is that path.
 *
 * Result rows on koreamed.org follow a consistent shape:
 *   <li class="searchListItem">
 *     <a class="title" ...>article title</a>
 *     <div class="authors">authors</div>
 *     <div class="journalInfo">Journal. 2024;5(2):101-110.</div>
 *     <a class="doiLink" href="https://doi.org/10.x/y">…</a>
 *   </li>
 *
 * If the markup changes upstream, the per-field regexes in `parseKoreaMedHtml`
 * are the single point of repair. Tests pin a synthetic page so we'll catch
 * a parser regression locally even when the live site is unreachable.
 */
export async function searchKoreaMed(
  query: string,
  opts: FetchOptions & { limit?: number } = {},
): Promise<FetchResult<SearchHit[]>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  const limit = clampLimit(opts.limit, 25);
  const url = `https://www.koreamed.org/SearchBasic.php?DT=&Q=${encodeURIComponent(trimmed)}`;
  const result = await httpText(url, opts);
  if (!result.ok) return result;
  try {
    const items = parseKoreaMedHtml(result.data, limit);
    const hits: SearchHit[] = items.map((entry) => ({
      entry,
      externalId: entry.fields.doi ?? entry.fields.title ?? '',
      source: 'koreamed' as const,
    }));
    return { ok: true, data: hits };
  } catch (err) {
    return {
      ok: false,
      code: 'parse',
      message: err instanceof Error ? err.message : 'parse failed',
    };
  }
}

/**
 * Lightweight HTML → BibEntry[] for KoreaMed search results. Uses pattern
 * matching rather than a full DOM parser to avoid dragging cheerio/jsdom
 * into the main bundle. Each list item is parsed independently so a
 * malformed entry doesn't poison the whole result set.
 */
export function parseKoreaMedHtml(html: string, limit: number): BibEntry[] {
  const entries: BibEntry[] = [];
  const itemRe = /<li[^>]*class="[^"]*searchListItem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  for (const m of html.matchAll(itemRe)) {
    if (entries.length >= limit) break;
    const item = m[1] ?? '';
    const entry = parseKoreaMedItem(item);
    if (entry) entries.push(entry);
  }
  return entries;
}

function parseKoreaMedItem(html: string): BibEntry | null {
  const title = stripTags(matchOne(html, /class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/i)).trim();
  if (!title) return null;
  const authorsRaw = stripTags(matchOne(html, /class="[^"]*authors?[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i)).trim();
  const journalInfo = stripTags(matchOne(html, /class="[^"]*journalInfo[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i)).trim();
  const doi = matchOne(html, /href="https?:\/\/(?:dx\.)?doi\.org\/([^"\s]+)"/i)
    || matchOne(html, /doi[:\s]*([0-9]{2}\.[0-9]+\/[^\s<"]+)/i);
  const fields: Record<string, string> = { title };
  if (authorsRaw) fields.author = normalizeKoreaMedAuthors(authorsRaw);
  const parsed = parseJournalInfo(journalInfo);
  if (parsed.journal) fields.journal = parsed.journal;
  if (parsed.year) fields.year = parsed.year;
  if (parsed.volume) fields.volume = parsed.volume;
  if (parsed.number) fields.number = parsed.number;
  if (parsed.pages) fields.pages = parsed.pages;
  if (doi) fields.doi = doi.trim();
  return { key: '', type: 'article', fields };
}

function matchOne(s: string, re: RegExp): string {
  const m = s.match(re);
  return m ? (m[1] ?? '') : '';
}

/**
 * "Doe J, Kim MG, Lee S." → "Doe, J and Kim, MG and Lee, S".
 * Korean-language pages sometimes give Hangul names directly — those pass
 * through unchanged (the cite-key generator handles RR romanization later).
 *
 * Assumes the KoreaMed shape: comma-separated author entries, each entry
 * being "Last Initials" (no internal comma). Does NOT round-trip already-
 * BibTeX-formatted "Last, First" lists; the parent caller never passes those.
 */
export function normalizeKoreaMedAuthors(raw: string): string {
  const trimmed = raw.replace(/\.\s*$/, '').trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/[,;]\s*|\s+and\s+/i).map((t) => t.trim()).filter(Boolean);
  return tokens
    .map((t) => {
      // Already in BibTeX "Last, First" shape.
      if (t.includes(',')) return t;
      const parts = t.split(/\s+/);
      if (parts.length === 1) return parts[0]!;
      const last = parts[0]!;
      const initials = parts.slice(1).join(' ');
      return `${last}, ${initials}`;
    })
    .join(' and ');
}

/**
 * "Korean J Med. 2024 Mar;99(2):101-110." → year/volume/number/pages split.
 * Tolerates missing pieces (some KoreaMed records are partial).
 */
export function parseJournalInfo(s: string): {
  journal?: string;
  year?: string;
  volume?: string;
  number?: string;
  pages?: string;
} {
  if (!s) return {};
  const out: ReturnType<typeof parseJournalInfo> = {};
  // Journal name = everything before the first 4-digit year.
  const yearMatch = s.match(/(.*?)\b(\d{4})\b/);
  if (yearMatch) {
    out.journal = yearMatch[1]!.replace(/[.;,\s]+$/, '').trim();
    out.year = yearMatch[2]!;
  }
  // volume(issue):pages — tolerant of optional pieces.
  const vol = s.match(/;(\d+)(?:\((\d+)\))?(?::([\dA-Z]+(?:[-–][\dA-Z]+)?))?/);
  if (vol) {
    if (vol[1]) out.volume = vol[1];
    if (vol[2]) out.number = vol[2];
    if (vol[3]) out.pages = vol[3].replace(/[–]/g, '-');
  }
  return out;
}

/** Variant of `httpJson` that returns the raw body — used by the scraper. */
export async function httpText(
  url: string,
  opts: FetchOptions,
): Promise<FetchResult<string>> {
  const fetcher = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { ok: false, code: 'network', message: 'fetch is unavailable' };
  }
  const ua = `Durumi/${DURUMI_VERSION} (https://github.com/kimmingul/durumi)${
    opts.email ? ` mailto:${opts.email}` : ''
  }`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetcher(url, {
      method: 'GET',
      headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' },
      signal: controller.signal,
    });
    if (r.status === 404) return { ok: false, code: 'not-found', message: '404 not found' };
    if (r.status === 429) return { ok: false, code: 'rate-limit', message: 'rate limited' };
    if (!r.ok) {
      return { ok: false, code: 'http', message: `HTTP ${r.status}`.trim() };
    }
    return { ok: true, data: await r.text() };
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

/**
 * ORCID iD → public profile via `pub.orcid.org`. The `/v3.0/{iD}/record`
 * endpoint is JSON when given the right Accept header, no auth required for
 * public data. We extract the credit name + first employment org for the
 * UI's "verify" affordance.
 */
export interface ResolvedOrcid {
  iD: string;
  name: string;
  affiliation: string | null;
  worksCount: number;
}

export async function resolveORCID(
  iDRaw: string,
  opts: FetchOptions = {},
): Promise<FetchResult<ResolvedOrcid>> {
  const iD = normalizeOrcidId(iDRaw);
  if (!iD) {
    return { ok: false, code: 'parse', message: 'invalid ORCID iD format' };
  }
  const fetcher = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { ok: false, code: 'network', message: 'fetch is unavailable' };
  }
  const url = `https://pub.orcid.org/v3.0/${iD}/record`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetcher(url, {
      method: 'GET',
      headers: {
        'User-Agent': `Durumi/${DURUMI_VERSION}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    if (r.status === 404) {
      return { ok: false, code: 'not-found', message: 'ORCID iD not found' };
    }
    if (!r.ok) {
      return { ok: false, code: 'http', message: `HTTP ${r.status}` };
    }
    const json = (await r.json()) as OrcidRecord;
    return { ok: true, data: extractOrcidProfile(iD, json) };
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

/** `0000-0002-1825-0097` shape — accepts that, the URL form, and "X" check digits. */
export function normalizeOrcidId(raw: string): string | null {
  if (!raw) return null;
  const stripped = raw.trim().replace(/^https?:\/\/(sandbox\.)?orcid\.org\//i, '');
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(stripped)) return null;
  return stripped;
}

interface OrcidRecord {
  person?: {
    name?: {
      'given-names'?: { value?: string };
      'family-name'?: { value?: string };
      'credit-name'?: { value?: string };
    };
  };
  'activities-summary'?: {
    employments?: {
      'affiliation-group'?: Array<{
        summaries?: Array<{
          'employment-summary'?: {
            organization?: { name?: string };
          };
        }>;
      }>;
    };
    works?: {
      group?: unknown[];
    };
  };
}

export function extractOrcidProfile(iD: string, json: OrcidRecord): ResolvedOrcid {
  const name = json.person?.name;
  const credit = name?.['credit-name']?.value;
  const fam = name?.['family-name']?.value ?? '';
  const giv = name?.['given-names']?.value ?? '';
  const display = credit ?? `${giv} ${fam}`.trim();
  let affiliation: string | null = null;
  const groups = json['activities-summary']?.employments?.['affiliation-group'] ?? [];
  for (const g of groups) {
    for (const s of g.summaries ?? []) {
      const org = s['employment-summary']?.organization?.name;
      if (org) {
        affiliation = org;
        break;
      }
    }
    if (affiliation) break;
  }
  const worksCount = (json['activities-summary']?.works?.group ?? []).length;
  return {
    iD,
    name: display,
    affiliation,
    worksCount,
  };
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
