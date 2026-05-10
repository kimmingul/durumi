import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAbstractMarkdown, downloadReference } from '../../electron/referenceDownload';
import type { BibEntry } from '../../shared/bibtex';

let dir: string;
let bibPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-refdl-'));
  bibPath = join(dir, 'references.bib');
  await writeFile(bibPath, '');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const baseEntry: BibEntry = {
  key: 'smith2024deep',
  type: 'article',
  fields: {
    author: 'Smith, John',
    title: 'Deep learning in radiology',
    journal: 'Nature',
    year: '2024',
    volume: '612',
    pages: '234-241',
    doi: '10.1038/x',
  },
};

function pdfBytes(): Buffer {
  // Minimal valid PDF: just the %PDF magic header is enough for our check.
  return Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pdfResponse(buf = pdfBytes()): Response {
  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  });
}

describe('buildAbstractMarkdown', () => {
  it('renders title + authors + venue + DOI', () => {
    const md = buildAbstractMarkdown(baseEntry);
    expect(md).toContain('# Deep learning in radiology');
    expect(md).toContain('**Authors**: Smith, John');
    expect(md).toContain('Nature');
    expect(md).toContain('2024');
    expect(md).toContain('10.1038/x');
  });

  it('falls back to a stub message when no abstract is present', () => {
    const md = buildAbstractMarkdown(baseEntry);
    expect(md).toContain('No abstract available');
  });

  it('inlines the abstract when the entry carries one', () => {
    const md = buildAbstractMarkdown({
      ...baseEntry,
      fields: { ...baseEntry.fields, abstract: 'A breakthrough study.' },
    });
    expect(md).toContain('## Abstract');
    expect(md).toContain('A breakthrough study.');
  });
});

describe('downloadReference — pipeline ordering', () => {
  it('uses Crossref link[] PDF when the publisher exposes one', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls++;
      if (url.startsWith('https://api.crossref.org/works/')) {
        return jsonResponse({
          message: {
            link: [{ URL: 'https://pub.example.com/p.pdf', 'content-type': 'application/pdf' }],
          },
        });
      }
      if (url === 'https://pub.example.com/p.pdf') {
        return pdfResponse();
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, baseEntry, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('crossref-link');
      expect(r.type).toBe('pdf');
      expect(r.relPath).toBe('reference/smith2024deep.pdf');
    }
    expect(calls).toBeGreaterThanOrEqual(2);
    const onDisk = await readFile(join(dir, 'reference/smith2024deep.pdf'));
    expect(onDisk.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('falls through to PMC when Crossref has no PDF link', async () => {
    const entry: BibEntry = { ...baseEntry, fields: { ...baseEntry.fields, pmid: '12345' } };
    const fetchImpl = (async (url: string) => {
      if (url.startsWith('https://api.crossref.org/')) {
        return jsonResponse({ message: { link: [] } });
      }
      if (url.startsWith('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink')) {
        return jsonResponse({
          linksets: [{ linksetdbs: [{ dbto: 'pmc', links: ['9999'] }] }],
        });
      }
      if (url.startsWith('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9999/pdf/')) {
        return pdfResponse();
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, entry, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('pmc');
  });

  it('falls through to Unpaywall when CR + PMC fail and email is configured', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith('https://api.crossref.org/')) {
        return jsonResponse({ message: { link: [] } });
      }
      if (url.startsWith('https://api.unpaywall.org/v2/')) {
        return jsonResponse({
          best_oa_location: { url_for_pdf: 'https://oa.example.com/p.pdf' },
        });
      }
      if (url === 'https://oa.example.com/p.pdf') {
        return pdfResponse();
      }
      throw new Error(`unexpected: ${url}`);
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, baseEntry, {
      fetchImpl,
      email: 'me@example.org',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('unpaywall');
  });

  it('falls back to abstract-only MD when every PDF source fails', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith('https://api.crossref.org/')) {
        return jsonResponse({ message: { link: [] } });
      }
      if (url.includes('eutils.ncbi.nlm.nih.gov')) {
        return jsonResponse({});
      }
      if (url.includes('unpaywall.org')) {
        return jsonResponse({});
      }
      // The HTML scrape attempt — return something too short to qualify.
      return new Response('x', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, baseEntry, { fetchImpl, email: 'me@x.org' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('abstract');
      expect(r.type).toBe('md');
      const md = await readFile(r.path, 'utf8');
      expect(md).toContain('# Deep learning in radiology');
    }
  });

  it('rejects PDFs without %PDF magic header', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith('https://api.crossref.org/')) {
        return jsonResponse({
          message: {
            link: [{ URL: 'https://x.com/x', 'content-type': 'application/pdf' }],
          },
        });
      }
      // Pretend-PDF — wrong magic header. Should be rejected.
      return new Response(Buffer.from('NOT A PDF') as unknown as BodyInit, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, baseEntry, { fetchImpl });
    // Pipeline keeps falling through; the abstract stub always succeeds.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('abstract');
  });

  it('skips network entirely with abstractOnly=true', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('x', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await downloadReference(bibPath, baseEntry, { fetchImpl, abstractOnly: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('abstract');
    expect(calls).toBe(0);
  });
});
