import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPdfText, type PdfParser } from '../../electron/pdfText';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-pdftext-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeParser(pages: string[]): PdfParser {
  return {
    parsePages: async (_buf, max) => pages.slice(0, max),
  };
}

describe('extractPdfText', () => {
  it('returns concatenated page text on a valid %PDF file', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\nfake body\n', 'latin1');
    const r = await extractPdfText(path, {
      parser: fakeParser(['Page one text.', 'Page two text.']),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('Page one text.');
      expect(r.text).toContain('Page two text.');
      expect(r.pages).toBe(2);
    }
  });

  it('rejects files without the %PDF magic header', async () => {
    const path = join(dir, 'fake.pdf');
    await writeFile(path, 'just plain text', 'utf8');
    const r = await extractPdfText(path, { parser: fakeParser(['x']) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PDF header/i);
  });

  it('returns false on a non-existent path', async () => {
    const r = await extractPdfText(join(dir, 'missing.pdf'), {
      parser: fakeParser([]),
    });
    expect(r.ok).toBe(false);
  });

  it('caps to maxPages when the PDF has more', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\n', 'latin1');
    const r = await extractPdfText(path, {
      maxPages: 2,
      parser: fakeParser(['p1', 'p2', 'p3', 'p4']),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages).toBe(2);
  });

  it('truncates the joined text to maxChars', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\n', 'latin1');
    const longText = 'x'.repeat(20_000);
    const r = await extractPdfText(path, {
      maxChars: 100,
      parser: fakeParser([longText]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.length).toBe(100);
  });

  it('catches parser errors and surfaces them as { ok: false }', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\n', 'latin1');
    const throwing: PdfParser = {
      parsePages: async () => { throw new Error('corrupt'); },
    };
    const r = await extractPdfText(path, { parser: throwing });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('corrupt');
  });
});
