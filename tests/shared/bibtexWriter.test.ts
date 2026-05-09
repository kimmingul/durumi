import { describe, it, expect } from 'vitest';
import { escapeBibValue, formatEntry, serializeForAppend } from '../../shared/bibtexWriter';
import { parseBibTeX } from '../../shared/bibtex';
import type { BibEntry } from '../../shared/bibtex';

describe('formatEntry', () => {
  it('emits the canonical article shape', () => {
    const entry: BibEntry = {
      key: 'smith2024deep',
      type: 'article',
      fields: {
        author: 'Smith, John and Doe, Jane',
        title: 'Deep learning in radiology',
        journal: 'Nature',
        year: '2024',
        volume: '612',
        pages: '234-241',
        doi: '10.1038/s41586-024-XXXXX-X',
      },
    };
    const out = formatEntry(entry);
    expect(out.startsWith('@article{smith2024deep,')).toBe(true);
    expect(out.endsWith('\n}')).toBe(true);
    expect(out).toContain('author = {Smith, John and Doe, Jane}');
    expect(out).toContain('doi = {10.1038/s41586-024-XXXXX-X}');
  });

  it('orders fields canonically (author → title → journal → year …)', () => {
    const entry: BibEntry = {
      key: 'x',
      type: 'article',
      fields: {
        // Insert in shuffled order on purpose.
        doi: 'd',
        year: '2024',
        title: 't',
        author: 'a',
        journal: 'j',
      },
    };
    const out = formatEntry(entry);
    const order = ['author', 'title', 'journal', 'year', 'doi'];
    let last = -1;
    for (const f of order) {
      const idx = out.indexOf(`${f} =`);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it('omits empty fields', () => {
    const entry: BibEntry = {
      key: 'x',
      type: 'article',
      fields: { author: 'A', title: '', journal: 'J', year: '2024' },
    };
    const out = formatEntry(entry);
    expect(out).not.toContain('title =');
    expect(out).toContain('journal = {J}');
  });

  it('appends non-canonical fields after the canonical ones, alphabetised', () => {
    const entry: BibEntry = {
      key: 'x',
      type: 'misc',
      fields: { title: 't', zebra: 'z', alpha: 'a' },
    };
    const out = formatEntry(entry);
    const ai = out.indexOf('alpha =');
    const zi = out.indexOf('zebra =');
    expect(ai).toBeGreaterThan(out.indexOf('title ='));
    expect(zi).toBeGreaterThan(ai);
  });

  it('drops the trailing comma on the last field', () => {
    const entry: BibEntry = {
      key: 'x',
      type: 'article',
      fields: { title: 't', year: '2024' },
    };
    const out = formatEntry(entry);
    // Penultimate line has comma; last (`}`) does not.
    const lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('}');
    expect(lines[lines.length - 2]!.endsWith(',')).toBe(false);
  });

  it('round-trips through parseBibTeX', () => {
    const original: BibEntry = {
      key: 'kim2024ai',
      type: 'article',
      fields: {
        author: 'Kim, Min-Gul',
        title: 'AI in clinical practice',
        journal: 'Korean Journal of Medicine',
        year: '2024',
        volume: '99',
        pages: '101--110',
        doi: '10.1234/abc',
      },
    };
    const formatted = formatEntry(original);
    const reparsed = parseBibTeX(formatted);
    expect(reparsed.entries).toHaveLength(1);
    const back = reparsed.entries[0]!;
    expect(back.key).toBe(original.key);
    expect(back.type).toBe(original.type);
    expect(back.fields.author).toBe(original.fields.author);
    expect(back.fields.title).toBe(original.fields.title);
    expect(back.fields.doi).toBe(original.fields.doi);
  });

  it('handles UTF-8 (Korean, Chinese, German) without escaping', () => {
    const entry: BibEntry = {
      key: 'x',
      type: 'article',
      fields: {
        author: '김민걸',
        title: '한국어 의학 연구',
        journal: 'Über Größe',
      },
    };
    const out = formatEntry(entry);
    expect(out).toContain('author = {김민걸}');
    expect(out).toContain('title = {한국어 의학 연구}');
    expect(out).toContain('journal = {Über Größe}');
  });

  it('serializeForAppend ends with a single newline', () => {
    const entry: BibEntry = { key: 'x', type: 'misc', fields: { title: 't' } };
    const out = serializeForAppend(entry);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('escapeBibValue', () => {
  it('passes balanced braces through unchanged', () => {
    expect(escapeBibValue('On {NASA} mission')).toBe('On {NASA} mission');
  });

  it('escapes a stray closing brace', () => {
    expect(escapeBibValue('a}b')).toBe('a\\}b');
  });

  it('escapes a stray opening brace', () => {
    expect(escapeBibValue('a{b')).toBe('a\\{b');
  });

  it('preserves existing backslash escapes', () => {
    expect(escapeBibValue('a \\& b')).toBe('a \\& b');
  });

  it('keeps nested balanced braces intact', () => {
    expect(escapeBibValue('a {b {c} d} e')).toBe('a {b {c} d} e');
  });

  it('produces a parse-able value when wrapped', () => {
    const v = escapeBibValue('x } y'); // unbalanced closer
    const src = `@misc{k, title = {${v}}}`;
    const parsed = parseBibTeX(src);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.fields.title).toBe('x \\} y');
  });
});
