import { promises as fs } from 'node:fs';
import TurndownService from 'turndown';
import type { BibEntry } from '@shared/bibtex';
import { httpJson, httpText } from './bibliographyFetch';
import {
  defaultDownloadPath,
  ensureReferenceDir,
  referenceDir,
} from './referenceFs';

/**
 * Download pipeline for v0.1.7 Track B. Ordered probe of free / OA sources;
 * falls back through HTML→Markdown and finally an abstract-only stub. All
 * network calls go through the shared `httpJson`/`httpText` helpers so the
 * User-Agent + timeout policies match the rest of the bibliography surface.
 *
 * Probe order (per the v0.1.7 design):
 *   1. Crossref `link[]` array (if the publisher exposed an `application/pdf`
 *      content-type entry)
 *   2. PMC OA service when the entry has a PMC ID
 *   3. Unpaywall (`api.unpaywall.org/v2/{doi}?email=…`) — this is the
 *      definitive OA-status oracle
 *   4. HTML scrape: fetch the URL we have, run through Turndown
 *   5. Abstract-only stub: format whatever metadata is on the entry into
 *      a self-contained `.md`. Always succeeds, so the pipeline always
 *      produces SOMETHING.
 *
 * Privacy: every step is initiated by an explicit user click — no
 * background prefetch. The renderer surfaces a confirm modal before this
 * function is called with the source URL + license context.
 */
export interface DownloadOptions {
  /** Crossref polite-pool email (also used by Unpaywall — required there). */
  email?: string | null;
  /** When true, skip steps 1–4 and write only the abstract stub. */
  abstractOnly?: boolean;
  /** Test injection. */
  fetchImpl?: typeof fetch;
}

export interface DownloadResult {
  ok: true;
  /** Absolute path of the file we just wrote. */
  path: string;
  /** `references.bib`-relative path (drops into `entry.fields.file`). */
  relPath: string;
  /** `'pdf'` or `'md'`. */
  type: 'pdf' | 'md';
  /** Which probe succeeded. Used for the toast / status badge. */
  source: 'crossref-link' | 'pmc' | 'unpaywall' | 'html-scrape' | 'abstract';
  /** URL we actually fetched, when applicable. */
  fetchedFrom?: string;
}

export interface DownloadError {
  ok: false;
  code: 'no-doi' | 'no-source' | 'http' | 'write-failed' | 'parse';
  message: string;
}

const PDF_MAX_BYTES = 50 * 1024 * 1024; // 50MB sanity cap

/**
 * `bibPath` anchors the `reference/` folder. `entry` carries the metadata
 * we already have; the caller (renderer) is expected to pass the live
 * BibEntry (with fields up-to-date from the bib file).
 */
export async function downloadReference(
  bibPath: string,
  entry: BibEntry,
  opts: DownloadOptions = {},
): Promise<DownloadResult | DownloadError> {
  await ensureReferenceDir(bibPath);
  const doi = (entry.fields.doi ?? '').trim();
  const pmid = (entry.fields.pmid ?? '').trim();

  if (opts.abstractOnly) {
    return writeAbstractMd(bibPath, entry, 'abstract');
  }

  // --- Step 1: Crossref `link[]` PDF ---------------------------------
  if (doi) {
    const linkUrl = await crossrefPdfLinkFor(doi, opts);
    if (linkUrl) {
      const r = await downloadPdf(bibPath, entry.key, linkUrl, opts);
      if (r.ok) return { ...r, source: 'crossref-link', fetchedFrom: linkUrl };
    }
  }

  // --- Step 2: PMC OA --------------------------------------------------
  if (pmid) {
    const pmcUrl = await pmcPdfUrl(pmid, opts);
    if (pmcUrl) {
      const r = await downloadPdf(bibPath, entry.key, pmcUrl, opts);
      if (r.ok) return { ...r, source: 'pmc', fetchedFrom: pmcUrl };
    }
  }

  // --- Step 3: Unpaywall ----------------------------------------------
  if (doi && opts.email) {
    const oaUrl = await unpaywallPdfUrl(doi, opts.email, opts);
    if (oaUrl) {
      const r = await downloadPdf(bibPath, entry.key, oaUrl, opts);
      if (r.ok) return { ...r, source: 'unpaywall', fetchedFrom: oaUrl };
    }
  }

  // --- Step 4: HTML → MD ----------------------------------------------
  const htmlUrl = (entry.fields.url ?? '').trim() || (doi ? `https://doi.org/${doi}` : '');
  if (htmlUrl) {
    const md = await fetchAndConvert(htmlUrl, opts);
    if (md.ok) {
      const out = await writeMd(bibPath, entry.key, md.markdown);
      if (out.ok) return { ...out, source: 'html-scrape', fetchedFrom: htmlUrl };
    }
  }

  // --- Step 5: Abstract-only stub -------------------------------------
  return writeAbstractMd(bibPath, entry, 'abstract');
}

// ------------------------------ Step 1 ----------------------------------

interface CrossrefLink {
  URL?: string;
  'content-type'?: string;
  'intended-application'?: string;
}

interface CrossrefMessageWithLink {
  link?: CrossrefLink[];
}

async function crossrefPdfLinkFor(doi: string, opts: DownloadOptions): Promise<string | null> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const r = await httpJson<{ message: CrossrefMessageWithLink }>(url, {
    email: opts.email ?? null,
    fetchImpl: opts.fetchImpl,
  });
  if (!r.ok) return null;
  for (const link of r.data.message.link ?? []) {
    if ((link['content-type'] ?? '').toLowerCase() === 'application/pdf' && link.URL) {
      return link.URL;
    }
  }
  return null;
}

// ------------------------------ Step 2 ----------------------------------

interface ElinkResponse {
  linksets?: Array<{
    linksetdbs?: Array<{
      dbto?: string;
      links?: string[];
    }>;
  }>;
}

/**
 * Map PMID → PMC ID via E-utilities ELink, then build the canonical PMC
 * PDF URL. Returns null when the article has no PMC counterpart (most
 * non-OA papers).
 */
async function pmcPdfUrl(pmid: string, opts: DownloadOptions): Promise<string | null> {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pmc&id=${encodeURIComponent(pmid)}&retmode=json`;
  const r = await httpJson<ElinkResponse>(url, {
    email: opts.email ?? null,
    fetchImpl: opts.fetchImpl,
  });
  if (!r.ok) return null;
  for (const ls of r.data.linksets ?? []) {
    for (const db of ls.linksetdbs ?? []) {
      if (db.dbto === 'pmc' && db.links && db.links.length > 0) {
        return `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${db.links[0]}/pdf/`;
      }
    }
  }
  return null;
}

// ------------------------------ Step 3 ----------------------------------

interface UnpaywallResponse {
  best_oa_location?: {
    url_for_pdf?: string;
    license?: string;
  };
}

async function unpaywallPdfUrl(
  doi: string,
  email: string,
  opts: DownloadOptions,
): Promise<string | null> {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`;
  const r = await httpJson<UnpaywallResponse>(url, {
    email,
    fetchImpl: opts.fetchImpl,
  });
  if (!r.ok) return null;
  return r.data.best_oa_location?.url_for_pdf ?? null;
}

// ------------------------------ Step 4 ----------------------------------

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
});
// Drop chrome that's never useful in a saved reference.
turndownService.remove(['script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside']);

interface HtmlFetchOk { ok: true; markdown: string }
interface HtmlFetchErr { ok: false }

async function fetchAndConvert(url: string, opts: DownloadOptions): Promise<HtmlFetchOk | HtmlFetchErr> {
  const r = await httpText(url, {
    email: opts.email ?? null,
    fetchImpl: opts.fetchImpl,
  });
  if (!r.ok) return { ok: false };
  try {
    const html = stripHeadAndChrome(r.data);
    const markdown = turndownService.turndown(html).trim();
    if (markdown.length < 80) return { ok: false }; // looks like a stub page; bail
    return { ok: true, markdown };
  } catch {
    return { ok: false };
  }
}

function stripHeadAndChrome(html: string): string {
  // Trim <head>...</head> and the noisy elements before turndown sees them.
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');
}

// ------------------------------ Step 5 ----------------------------------

/**
 * Format whatever metadata we have on the entry into a self-contained
 * markdown stub. This always succeeds — it's the floor of the pipeline
 * so the user is never left with nothing.
 */
export function buildAbstractMarkdown(entry: BibEntry): string {
  const f = entry.fields;
  const lines: string[] = [];
  lines.push(`# ${f.title ?? '(untitled)'}\n`);
  if (f.author) lines.push(`**Authors**: ${f.author}\n`);
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? '';
  const meta = [venue, f.volume && `vol. ${f.volume}`, f.number && `no. ${f.number}`, f.pages && `pp. ${f.pages}`, f.year]
    .filter(Boolean)
    .join(' · ');
  if (meta) lines.push(`**${meta}**\n`);
  if (f.doi) {
    const cleanDoi = f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    lines.push(`**DOI**: [${cleanDoi}](https://doi.org/${cleanDoi})\n`);
  }
  if (f.pmid) lines.push(`**PMID**: ${f.pmid}\n`);
  if (f.url) lines.push(`**URL**: <${f.url}>\n`);
  if (f.abstract) {
    lines.push(`\n## Abstract\n\n${f.abstract}\n`);
  } else {
    lines.push(`\n_(No abstract available — saved metadata only.)_\n`);
  }
  lines.push(`\n---\n\n_Saved by Durumi · ${new Date().toISOString().slice(0, 10)}_\n`);
  return lines.join('');
}

async function writeAbstractMd(
  bibPath: string,
  entry: BibEntry,
  source: 'abstract',
): Promise<DownloadResult> {
  const md = buildAbstractMarkdown(entry);
  const r = await writeMd(bibPath, entry.key, md);
  if (!r.ok) {
    // writeMd never fails in tests, but be exhaustive.
    return { ...r, source } as unknown as DownloadResult;
  }
  return { ...r, source };
}

/**
 * v0.1.10 — auto-save abstract on add. Unlike `downloadReference`, this
 * helper does NOT make any network call and does NOT overwrite an existing
 * `reference/<key>.*` file (it's idempotent for repeat-add flows). When a
 * matching file is already on disk we return `{ ok: true, skipped: true }`
 * so the caller can distinguish "skipped — already present" from "wrote".
 */
export interface AutoSaveAbstractResult {
  ok: true;
  /** `true` when a reference file already existed and we left it alone. */
  skipped: boolean;
  /** Filesystem path of the file we wrote (or that already existed). */
  path: string | null;
  /** `references.bib`-relative path of the file we wrote (when not skipped). */
  relPath: string | null;
}

export interface AutoSaveAbstractError {
  ok: false;
  error: string;
}

export async function autoSaveAbstract(
  bibPath: string,
  entry: BibEntry,
): Promise<AutoSaveAbstractResult | AutoSaveAbstractError> {
  if (!entry.key) {
    return { ok: false, error: 'entry has no key' };
  }
  try {
    await ensureReferenceDir(bibPath);
    // If ANY file already lives at reference/<key>.{pdf,md} we treat that
    // as the user's chosen artefact and skip.
    const dir = referenceDir(bibPath);
    for (const ext of ['pdf', 'md'] as const) {
      const candidate = `${dir}/${entry.key}.${ext}`;
      try {
        await fs.access(candidate);
        return { ok: true, skipped: true, path: candidate, relPath: null };
      } catch {
        // not present — keep probing
      }
    }
    const r = await writeAbstractMd(bibPath, entry, 'abstract');
    return { ok: true, skipped: false, path: r.path, relPath: r.relPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

// ---------------- Common write helpers ----------------------------------

async function downloadPdf(
  bibPath: string,
  key: string,
  url: string,
  opts: DownloadOptions,
): Promise<DownloadResult | DownloadError> {
  const fetcher = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { ok: false, code: 'http', message: 'fetch unavailable' };
  }
  const ua = 'Durumi/0.1.7 (https://github.com/kimmingul/durumi)' + (opts.email ? ` mailto:${opts.email}` : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const r = await fetcher(url, {
      method: 'GET',
      headers: { 'User-Agent': ua, 'Accept': 'application/pdf' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!r.ok) {
      return { ok: false, code: 'http', message: `HTTP ${r.status}` };
    }
    const ct = (r.headers.get('content-type') ?? '').toLowerCase();
    if (!ct.includes('application/pdf') && !ct.includes('octet-stream')) {
      return { ok: false, code: 'parse', message: `not a PDF (${ct || 'no content-type'})` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > PDF_MAX_BYTES) {
      return { ok: false, code: 'parse', message: 'PDF exceeds 50MB cap' };
    }
    if (!buf.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      return { ok: false, code: 'parse', message: 'response did not start with %PDF' };
    }
    const { absPath, relPath } = defaultDownloadPath(bibPath, key, 'pdf');
    await atomicWriteBinary(absPath, buf);
    return { ok: true, path: absPath, relPath, type: 'pdf', source: 'crossref-link' };
  } catch (err) {
    return {
      ok: false,
      code: 'http',
      message: err instanceof Error ? err.message : 'download failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function writeMd(
  bibPath: string,
  key: string,
  markdown: string,
): Promise<DownloadResult> {
  const { absPath, relPath } = defaultDownloadPath(bibPath, key, 'md');
  await atomicWriteText(absPath, markdown);
  return { ok: true, path: absPath, relPath, type: 'md', source: 'abstract' };
}

async function atomicWriteText(absPath: string, content: string): Promise<void> {
  const tmp = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

async function atomicWriteBinary(absPath: string, buf: Buffer): Promise<void> {
  const tmp = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, buf);
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

// `referenceDir` re-export so callers don't have to import from two places.
export { referenceDir };
