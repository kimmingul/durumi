import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry, computeBibPath, ensureBibFile, removeEntry, renameEntryKey, upsertEntry } from '../../electron/bibliographyWrite';
import { parseBibTeX } from '../../shared/bibtex';
import type { BibEntry } from '../../shared/bibtex';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-bibwrite-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sampleEntry: BibEntry = {
  key: '',
  type: 'article',
  fields: {
    author: 'Smith, John',
    title: 'Deep learning in radiology',
    journal: 'Nature',
    year: '2024',
    doi: '10.1038/x',
  },
};

describe('ensureBibFile', () => {
  it('returns the existing references.bib when present', async () => {
    const docPath = join(dir, 'doc.md');
    const bibPath = join(dir, 'references.bib');
    await writeFile(docPath, '# x');
    await writeFile(bibPath, '@article{a, title={t}}');
    const r = await ensureBibFile(docPath);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.path).toBe(bibPath);
      expect(r.created).toBe(false);
    }
  });

  it('prefers references.bib over the alternative names', async () => {
    const docPath = join(dir, 'doc.md');
    await writeFile(docPath, '# x');
    await writeFile(join(dir, 'bibliography.bib'), '@article{a}');
    await writeFile(join(dir, 'references.bib'), '@article{b}');
    const r = await ensureBibFile(docPath);
    if (!('error' in r)) {
      expect(r.path).toBe(join(dir, 'references.bib'));
    }
  });

  it('creates references.bib when none exists', async () => {
    const docPath = join(dir, 'doc.md');
    await writeFile(docPath, '# x');
    const r = await ensureBibFile(docPath);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.created).toBe(true);
      expect(r.path).toBe(join(dir, 'references.bib'));
      const content = await readFile(r.path, 'utf8');
      expect(content).toBe('');
    }
  });

  it('returns no-document error when called with null docPath', async () => {
    const r = await ensureBibFile(null);
    expect('error' in r).toBe(true);
  });
});

describe('computeBibPath', () => {
  it('reports exists:true for an existing references.bib', async () => {
    const docPath = join(dir, 'doc.md');
    const bibPath = join(dir, 'references.bib');
    await writeFile(docPath, '# x');
    await writeFile(bibPath, '@article{a}');
    const r = await computeBibPath(docPath);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.path).toBe(bibPath);
      expect(r.exists).toBe(true);
    }
  });

  it('reports exists:false and a default path when nothing exists yet', async () => {
    // This is the v0.2.x guarantee: a binding probe must not write to disk.
    const docPath = join(dir, 'doc.md');
    await writeFile(docPath, '# x');
    const r = await computeBibPath(docPath);
    if (!('error' in r)) {
      expect(r.path).toBe(join(dir, 'references.bib'));
      expect(r.exists).toBe(false);
    }
    // Side-effect guard: probing must NOT create the .bib.
    await expect(readFile(join(dir, 'references.bib'))).rejects.toThrow();
  });

  it('returns no-document error when called with null docPath', async () => {
    const r = await computeBibPath(null);
    expect('error' in r).toBe(true);
  });
});

describe('appendEntry', () => {
  it('writes the entry to an empty file with a generated key', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '');
    const r = await appendEntry(bib, sampleEntry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key).toBe('smith2024deep');
    }
    const content = await readFile(bib, 'utf8');
    const parsed = parseBibTeX(content);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.fields.title).toBe('Deep learning in radiology');
  });

  it('appends to a file that already has an entry, separated by blank line', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{old2020,\n  title = {Old},\n  year = {2020}\n}\n',
    );
    const r = await appendEntry(bib, sampleEntry);
    expect(r.ok).toBe(true);
    const content = await readFile(bib, 'utf8');
    const parsed = parseBibTeX(content);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]?.key).toBe('old2020');
    if (r.ok) expect(parsed.entries[1]?.key).toBe(r.key);
  });

  it('de-collides when the generated key is already in the file', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{smith2024deep,\n  title = {Earlier}\n}\n',
    );
    const r = await appendEntry(bib, sampleEntry);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe('smith2024deepa');
  });

  it('creates the file if it does not exist (ENOENT)', async () => {
    const bib = join(dir, 'references.bib');
    const r = await appendEntry(bib, sampleEntry);
    expect(r.ok).toBe(true);
    const content = await readFile(bib, 'utf8');
    expect(content).toContain('@article');
  });

  it('writes atomically — no .tmp file lingers on success', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '');
    await appendEntry(bib, sampleEntry);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    expect(files.some((f) => f.includes('.tmp-'))).toBe(false);
  });

  it('preserves an explicit non-colliding key from the entry', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '');
    const e = { ...sampleEntry, key: 'mychosen2024' };
    const r = await appendEntry(bib, e);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe('mychosen2024');
  });
});

describe('upsertEntry', () => {
  it('replaces an existing entry by key, preserving the rest', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{a, title = {Old}, year = {2020}}\n\n@article{b, title = {Other}}\n',
    );
    const r = await upsertEntry(bib, {
      key: 'a',
      type: 'article',
      fields: { title: 'New Title', year: '2024' },
    });
    expect(r.ok).toBe(true);
    const after = parseBibTeX(await readFile(bib, 'utf8'));
    expect(after.entries).toHaveLength(2);
    const a = after.entries.find((e) => e.key === 'a')!;
    expect(a.fields.title).toBe('New Title');
    expect(a.fields.year).toBe('2024');
    const b = after.entries.find((e) => e.key === 'b')!;
    expect(b.fields.title).toBe('Other');
  });

  it('appends when the key is not present', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{a, title={A}}\n');
    const r = await upsertEntry(bib, {
      key: 'b',
      type: 'article',
      fields: { title: 'B' },
    });
    expect(r.ok).toBe(true);
    const after = parseBibTeX(await readFile(bib, 'utf8'));
    expect(after.entries.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('rejects when key is empty', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '');
    const r = await upsertEntry(bib, {
      key: '',
      type: 'article',
      fields: { title: 'X' },
    });
    expect(r.ok).toBe(false);
  });
});

describe('removeEntry', () => {
  it('removes an entry by key', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{a, title={A}}\n\n@article{b, title={B}}\n',
    );
    const r = await removeEntry(bib, 'a');
    expect(r.ok).toBe(true);
    const after = parseBibTeX(await readFile(bib, 'utf8'));
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.key).toBe('b');
  });

  it('returns not-found when key is missing', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{a}\n');
    const r = await removeEntry(bib, 'missing');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not-found');
  });

  it('produces an empty file when the last entry is removed', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{only, title={X}}\n');
    const r = await removeEntry(bib, 'only');
    expect(r.ok).toBe(true);
    const content = await readFile(bib, 'utf8');
    expect(content).toBe('');
  });
});

describe('renameEntryKey', () => {
  it('renames the entry and preserves all fields', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{old2020, title = {T}, year = {2020}, author = {Smith, J}}\n',
    );
    const r = await renameEntryKey(bib, 'old2020', 'smith2020t');
    expect(r.ok).toBe(true);
    const after = parseBibTeX(await readFile(bib, 'utf8'));
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.key).toBe('smith2020t');
    expect(after.entries[0]?.fields.title).toBe('T');
    expect(after.entries[0]?.fields.author).toBe('Smith, J');
  });

  it('rejects when newKey is already taken', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{a}\n\n@article{b}\n');
    const r = await renameEntryKey(bib, 'a', 'b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('key-taken');
  });

  it('rejects when oldKey is missing', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{a}\n');
    const r = await renameEntryKey(bib, 'missing', 'new');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not-found');
  });

  it('rejects when keys are equal', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(bib, '@article{a}\n');
    const r = await renameEntryKey(bib, 'a', 'a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('noop');
  });

  it('preserves entries other than the target', async () => {
    const bib = join(dir, 'references.bib');
    await writeFile(
      bib,
      '@article{first, title={A}}\n\n@article{target, title={B}}\n\n@article{last, title={C}}\n',
    );
    const r = await renameEntryKey(bib, 'target', 'renamed');
    expect(r.ok).toBe(true);
    const after = parseBibTeX(await readFile(bib, 'utf8'));
    expect(after.entries.map((e) => e.key)).toEqual(['first', 'renamed', 'last']);
  });
});
