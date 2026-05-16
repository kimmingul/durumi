import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { BibEntry } from '@shared/bibtex';
import { extractPdfText, type PdfParser } from './pdfText';

// Reverse-direction sync for v0.1.7 Track C: when a file appears in
// <doc-folder>/reference/ that isn't tied to any bib entry, we try to
// derive a BibEntry for it.
//
// PDF path: v0.1.8.2 upgraded from regex-on-raw-bytes to pdfjs-dist —
// the regex approach missed DOIs in compressed content streams (which
// is most of a modern journal PDF) and only caught Info-dict matches
// when the trailer happened to be uncompressed. The extractor walks
// the first few pages with proper text extraction, then DOI regex
// runs against actual readable text. The legacy-build is lazy-loaded
// so app startup isn't slowed by the 2MB pdfjs payload.

const DOI_RE = /\b10\.\d{4,9}\/[A-Za-z0-9._;()/:%~+-]+/;
const MD_SCAN_BYTES = 32 * 1024;
const PDF_DOI_PAGES = 3; // first 3 pages cover header / title / abstract

export interface ExtractDoiResult {
  doi: string | null;
  source: 'pdf-info' | 'pdf-content' | 'md-frontmatter' | 'md-body' | 'none';
}

export interface ExtractDoiOptions {
  /** Test seam — inject a fake parser so unit tests don't need real PDFs. */
  pdfParser?: PdfParser;
}

export async function extractDoiFromFile(
  absPath: string,
  opts: ExtractDoiOptions = {},
): Promise<ExtractDoiResult> {
  const ext = extname(absPath).toLowerCase();
  if (ext === '.pdf') return extractDoiFromPdf(absPath, opts);
  if (ext === '.md' || ext === '.markdown') return extractDoiFromMd(absPath);
  return { doi: null, source: 'none' };
}

async function extractDoiFromPdf(
  absPath: string,
  opts: ExtractDoiOptions,
): Promise<ExtractDoiResult> {
  // Try the proper text extraction first — covers compressed streams.
  const text = await extractPdfText(absPath, {
    maxPages: PDF_DOI_PAGES,
    maxChars: 32_000,
    parser: opts.pdfParser,
  });
  if (text.ok) {
    const m = DOI_RE.exec(text.text);
    if (m) return { doi: cleanDoi(m[0]), source: 'pdf-content' };
  }
  // Fallback: regex over the raw file head. Catches the rare case where
  // pdfjs-dist refuses (corrupt / encrypted / unusual encoding) but the
  // Info dict is plaintext. Limited scan window so we don't read 50MB.
  return scanRawHeaderForDoi(absPath);
}

async function scanRawHeaderForDoi(absPath: string): Promise<ExtractDoiResult> {
  let buf: Buffer;
  try {
    const handle = await fs.open(absPath, 'r');
    try {
      const stat = await handle.stat();
      const len = Math.min(stat.size, 256 * 1024);
      buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, 0);
    } finally {
      await handle.close();
    }
  } catch {
    return { doi: null, source: 'none' };
  }
  const text = buf.toString('latin1');
  const infoBlock = extractInfoBlock(text);
  if (infoBlock) {
    const m = DOI_RE.exec(infoBlock);
    if (m) return { doi: cleanDoi(m[0]), source: 'pdf-info' };
  }
  const m = DOI_RE.exec(text);
  if (m) return { doi: cleanDoi(m[0]), source: 'pdf-content' };
  return { doi: null, source: 'none' };
}

function extractInfoBlock(text: string): string | null {
  // PDF Info dict fields (Title / Subject / Keywords) often live inside an
  // object body that we recognise by a << ... >> block containing one of
  // those PDF-name keys. Matching by content is robust to reordered /
  // linearised PDFs and avoids parsing the cross-reference table.
  const re = /<<[\s\S]{0,4096}?(?:\/Subject|\/Title|\/Keywords)[\s\S]{0,4096}?>>/g;
  const m = re.exec(text);
  return m ? m[0] : null;
}

async function extractDoiFromMd(absPath: string): Promise<ExtractDoiResult> {
  let raw: string;
  try {
    const handle = await fs.open(absPath, 'r');
    try {
      const stat = await handle.stat();
      const len = Math.min(stat.size, MD_SCAN_BYTES);
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, 0);
      raw = buf.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return { doi: null, source: 'none' };
  }
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end > 0) {
      const fm = raw.slice(3, end);
      const m = /^\s*doi\s*:\s*([^\s]+)/im.exec(fm);
      if (m && m[1]) return { doi: cleanDoi(m[1]), source: 'md-frontmatter' };
    }
  }
  const m = DOI_RE.exec(raw);
  if (m) return { doi: cleanDoi(m[0]), source: 'md-body' };
  return { doi: null, source: 'none' };
}

function cleanDoi(raw: string): string {
  return raw.replace(/[>\]).,;]+$/, '');
}

// Build the minimum BibEntry from a manual-entry form. Used when DOI
// extraction fails: the user fills title / authors / year / optional DOI
// in a modal and we mint a key from those.
export interface ManualEntryFields {
  title: string;
  author?: string;
  year?: string;
  journal?: string;
  doi?: string;
  type?: string;
  file: string;
}

export function buildManualEntry(fields: ManualEntryFields): BibEntry {
  const out: Record<string, string> = {};
  if (fields.title) out.title = fields.title.trim();
  if (fields.author && fields.author.trim()) out.author = fields.author.trim();
  if (fields.year && fields.year.trim()) out.year = fields.year.trim();
  if (fields.journal && fields.journal.trim()) out.journal = fields.journal.trim();
  if (fields.doi && fields.doi.trim()) out.doi = fields.doi.trim();
  out.file = fields.file;
  return {
    key: '',
    type: (fields.type ?? 'misc').trim() || 'misc',
    fields: out,
  };
}
