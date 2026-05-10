import { promises as fs } from 'node:fs';

// Real PDF text extraction via pdfjs-dist. Used by:
//   - referenceImport.ts to find DOIs in compressed content streams (the
//     v0.1.7 regex-on-raw-bytes path missed everything inside FlateDecode
//     blocks, which is most of a modern journal PDF)
//   - aiCitationSuggest's enrichment to give the model the actual paper
//     content (intro / methods / discussion) instead of just the
//     Crossref abstract
//
// Lazy-loaded: pdfjs-dist is ~2MB. We only pay that cost the first time
// the user actually extracts PDF text, not at app startup.

export interface PdfParser {
  parsePages(buf: Buffer, maxPages: number): Promise<string[]>;
}

export interface ExtractOptions {
  /** Cap the number of pages we look at. Default 5. */
  maxPages?: number;
  /** Cap the total characters returned. Default 8000. */
  maxChars?: number;
  /** Test seam — production passes nothing and uses pdfjs-dist. */
  parser?: PdfParser;
}

export interface ExtractResult {
  ok: true;
  /** Concatenated text from the first `maxPages` pages, capped at `maxChars`. */
  text: string;
  /** Number of pages we actually read. */
  pages: number;
}

export interface ExtractError {
  ok: false;
  error: string;
}

/**
 * Read the file at `absPath` and run it through pdfjs-dist (or the
 * injected parser). Returns extracted text and the page count.
 *
 * Designed never to throw — corrupt PDFs, password-protected PDFs, and
 * non-PDF inputs all resolve to `{ ok: false, error }`. The caller falls
 * back gracefully: either to manual entry (for DOI extraction) or to
 * the abstract-only stub (for citation suggestion).
 */
export async function extractPdfText(
  absPath: string,
  opts: ExtractOptions = {},
): Promise<ExtractResult | ExtractError> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (buf.length < 4 || buf.subarray(0, 4).toString() !== '%PDF') {
    return { ok: false, error: 'not a PDF (missing %PDF header)' };
  }
  const parser = opts.parser ?? defaultParser;
  const maxPages = opts.maxPages ?? 5;
  const maxChars = opts.maxChars ?? 8000;
  let pages: string[];
  try {
    pages = await parser.parsePages(buf, maxPages);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const joined = pages.join('\n\n').slice(0, maxChars);
  return { ok: true, text: joined, pages: pages.length };
}

/**
 * pdfjs-dist-backed parser. Loaded lazily so the 2MB legacy build only
 * lands in process memory when the user actually triggers extraction.
 * `disableWorker: true` keeps everything synchronous in the main process
 * — no separate worker thread, no Web-Worker shim needed for Node.
 */
let pdfjsCache: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;

async function loadPdfjs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  if (!pdfjsCache) {
    pdfjsCache = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsCache;
}

export const defaultParser: PdfParser = {
  async parsePages(buf, maxPages) {
    const pdfjs = await loadPdfjs();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
      useSystemFonts: false,
      // Suppress the noisy "no font" warnings; we only care about text.
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    const pageCount = Math.min(doc.numPages, maxPages);
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: unknown) => {
            const it = item as { str?: string; hasEOL?: boolean };
            return (it.str ?? '') + (it.hasEOL ? '\n' : ' ');
          })
          .join('');
        pages.push(pageText.trim());
      } finally {
        page.cleanup();
      }
    }
    await doc.destroy();
    return pages;
  },
};

/** Test seam: lets unit tests reset the lazy-load cache between cases. */
export function _resetPdfjsCache(): void {
  pdfjsCache = null;
}
