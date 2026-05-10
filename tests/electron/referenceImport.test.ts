import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManualEntry, extractDoiFromFile } from '../../electron/referenceImport';
import type { PdfParser } from '../../electron/pdfText';

// v0.1.8.2: PDF parsing now goes through pdfjs-dist. Tests inject a
// fake parser that returns the page text we want; the regex / source
// classification logic is what we're verifying, not pdfjs itself.
function fakeParser(pages: string[]): PdfParser {
  return {
    parsePages: async (_buf, max) => pages.slice(0, max),
  };
}

function emptyParser(): PdfParser {
  return { parsePages: async () => [] };
}

function throwingParser(): PdfParser {
  return {
    parsePages: async () => { throw new Error('corrupt PDF'); },
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-refimport-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('extractDoiFromFile — PDF (pdfjs path)', () => {
  it('finds the DOI in extracted page text', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\n%fake\n', 'latin1');
    const r = await extractDoiFromFile(path, {
      pdfParser: fakeParser([
        'Title page header',
        'Abstract: The DOI is 10.1038/s41586-024-XXXXX for this study.',
      ]),
    });
    expect(r.source).toBe('pdf-content');
    expect(r.doi).toBe('10.1038/s41586-024-XXXXX');
  });

  it('falls back to raw-header scan when pdfjs returns no text', async () => {
    // Simulate pdfjs returning empty pages — we should still find the DOI
    // sitting plaintext in the Info dictionary.
    const pdfWithInfoDict = [
      '%PDF-1.4',
      '5 0 obj',
      '<<',
      '  /Title (Deep learning)',
      '  /Subject (10.1234/info)',
      '>>',
      'endobj',
      'trailer << /Info 5 0 R >>',
      '%%EOF',
    ].join('\n');
    const path = join(dir, 'paper.pdf');
    await writeFile(path, pdfWithInfoDict, 'latin1');
    const r = await extractDoiFromFile(path, { pdfParser: emptyParser() });
    expect(r.source).toBe('pdf-info');
    expect(r.doi).toBe('10.1234/info');
  });

  it('falls back to raw-header scan when pdfjs throws (corrupt PDF)', async () => {
    const pdfWithInline = '%PDF-1.4\nbody mentions doi:10.1056/NEJMoa1234567 here\n%%EOF';
    const path = join(dir, 'paper.pdf');
    await writeFile(path, pdfWithInline, 'latin1');
    const r = await extractDoiFromFile(path, { pdfParser: throwingParser() });
    expect(r.doi).toBe('10.1056/NEJMoa1234567');
  });

  it('returns null when no DOI appears anywhere', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\nno doi here\n%%EOF', 'latin1');
    const r = await extractDoiFromFile(path, { pdfParser: emptyParser() });
    expect(r.doi).toBeNull();
    expect(r.source).toBe('none');
  });

  it('strips trailing punctuation from the captured DOI', async () => {
    const path = join(dir, 'paper.pdf');
    await writeFile(path, '%PDF-1.4\n', 'latin1');
    const r = await extractDoiFromFile(path, {
      pdfParser: fakeParser(['Cite: 10.1056/NEJMoa1234567).']),
    });
    expect(r.doi).toBe('10.1056/NEJMoa1234567');
  });

  it('returns none for a non-existent file without throwing', async () => {
    const r = await extractDoiFromFile(join(dir, 'missing.pdf'));
    expect(r.doi).toBeNull();
  });
});

describe('extractDoiFromFile — Markdown', () => {
  it('reads doi from YAML front matter', async () => {
    const md = [
      '---',
      'title: A study',
      'doi: 10.5555/example',
      '---',
      '',
      '# Body',
    ].join('\n');
    const path = join(dir, 'paper.md');
    await writeFile(path, md);
    const r = await extractDoiFromFile(path);
    expect(r.source).toBe('md-frontmatter');
    expect(r.doi).toBe('10.5555/example');
  });

  it('falls back to body when front matter has no doi', async () => {
    const md = '---\ntitle: A\n---\n\nSee 10.1111/abc.';
    const path = join(dir, 'paper.md');
    await writeFile(path, md);
    const r = await extractDoiFromFile(path);
    expect(r.source).toBe('md-body');
    expect(r.doi).toBe('10.1111/abc');
  });

  it('returns none for plain markdown without a DOI', async () => {
    const path = join(dir, 'plain.md');
    await writeFile(path, '# Just a heading\nbody');
    const r = await extractDoiFromFile(path);
    expect(r.doi).toBeNull();
  });
});

describe('extractDoiFromFile — unknown file types', () => {
  it('returns none for .txt or other extensions', async () => {
    const path = join(dir, 'note.txt');
    await writeFile(path, 'doi: 10.1/x — but unsupported file type');
    const r = await extractDoiFromFile(path);
    expect(r.doi).toBeNull();
    expect(r.source).toBe('none');
  });
});

describe('buildManualEntry', () => {
  it('packs trimmed fields into a misc entry with file= set', () => {
    const e = buildManualEntry({
      title: '  Deep learning  ',
      author: 'Smith J',
      year: '2024',
      file: 'reference/paper.pdf',
    });
    expect(e.type).toBe('misc');
    expect(e.fields.title).toBe('Deep learning');
    expect(e.fields.author).toBe('Smith J');
    expect(e.fields.year).toBe('2024');
    expect(e.fields.file).toBe('reference/paper.pdf');
  });

  it('omits empty optional fields', () => {
    const e = buildManualEntry({ title: 'X', file: 'reference/x.md' });
    expect(e.fields.author).toBeUndefined();
    expect(e.fields.year).toBeUndefined();
    expect(e.fields.journal).toBeUndefined();
    expect(e.fields.doi).toBeUndefined();
  });

  it('honours an explicit type override', () => {
    const e = buildManualEntry({ title: 'X', file: 'reference/x.md', type: 'book' });
    expect(e.type).toBe('book');
  });
});
