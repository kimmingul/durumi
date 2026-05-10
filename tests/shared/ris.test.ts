import { describe, it, expect } from 'vitest';
import { parseRis } from '../../shared/ris';

describe('parseRis', () => {
  it('parses a minimal journal article entry', () => {
    const src = [
      'TY  - JOUR',
      'AU  - Smith, John',
      'AU  - Doe, Jane',
      'TI  - Deep learning in radiology',
      'JO  - Nature',
      'PY  - 2024',
      'VL  - 612',
      'IS  - 7938',
      'SP  - 234',
      'EP  - 241',
      'DO  - 10.1038/s41586-024-XXXXX',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.warnings).toEqual([]);
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0]!;
    expect(e.type).toBe('article');
    expect(e.fields.author).toBe('Smith, John and Doe, Jane');
    expect(e.fields.title).toBe('Deep learning in radiology');
    expect(e.fields.journal).toBe('Nature');
    expect(e.fields.year).toBe('2024');
    expect(e.fields.volume).toBe('612');
    expect(e.fields.number).toBe('7938');
    expect(e.fields.pages).toBe('234--241');
    expect(e.fields.doi).toBe('10.1038/s41586-024-XXXXX');
  });

  it('parses multiple entries separated by ER', () => {
    const src = [
      'TY  - JOUR',
      'TI  - First',
      'PY  - 2023',
      'ER  - ',
      '',
      'TY  - JOUR',
      'TI  - Second',
      'PY  - 2024',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]?.fields.title).toBe('First');
    expect(r.entries[1]?.fields.title).toBe('Second');
  });

  it('maps RIS types to BibTeX types', () => {
    const inputs: Array<[string, string]> = [
      ['JOUR', 'article'],
      ['BOOK', 'book'],
      ['CHAP', 'incollection'],
      ['CONF', 'inproceedings'],
      ['THES', 'phdthesis'],
      ['RPRT', 'techreport'],
      ['UNKNOWN', 'misc'],
    ];
    for (const [ty, expected] of inputs) {
      const src = `TY  - ${ty}\nTI  - x\nER  - `;
      const r = parseRis(src);
      expect(r.entries[0]?.type, ty).toBe(expected);
    }
  });

  it('treats AU and A1 as author tags', () => {
    const src = [
      'TY  - JOUR',
      'A1  - Smith, John',
      'AU  - Doe, Jane',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.entries[0]?.fields.author).toBe('Doe, Jane and Smith, John');
  });

  it('falls back to editor when no authors are present', () => {
    const src = [
      'TY  - BOOK',
      'A3  - Editor, E',
      'TI  - Edited Volume',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.entries[0]?.fields.author).toBeUndefined();
    expect(r.entries[0]?.fields.editor).toBe('Editor, E');
  });

  it('joins continuation lines into the previous tag value', () => {
    const src = [
      'TY  - JOUR',
      'AB  - This is the first part',
      'of an abstract that continues',
      'on the next line.',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.entries[0]?.fields.abstract).toContain('first part');
    expect(r.entries[0]?.fields.abstract).toContain('continues');
    expect(r.entries[0]?.fields.abstract).toContain('next line');
  });

  it('extracts year from longer date strings', () => {
    const src = 'TY  - JOUR\nDA  - 2024/03/15\nER  - ';
    const r = parseRis(src);
    expect(r.entries[0]?.fields.year).toBe('2024');
  });

  it('classifies SN as ISSN vs ISBN by shape', () => {
    const issnSrc = 'TY  - JOUR\nSN  - 1234-567X\nER  - ';
    const isbnSrc = 'TY  - BOOK\nSN  - 978-3-16-148410-0\nER  - ';
    expect(parseRis(issnSrc).entries[0]?.fields.issn).toBe('1234-567X');
    expect(parseRis(isbnSrc).entries[0]?.fields.isbn).toBe('978-3-16-148410-0');
  });

  it('uses ID as the entry key when present', () => {
    const src = 'TY  - JOUR\nID  - smith2024deep\nTI  - X\nER  - ';
    const r = parseRis(src);
    expect(r.entries[0]?.key).toBe('smith2024deep');
  });

  it('emits a warning when a tag appears outside TY/ER block', () => {
    const src = 'TI  - orphan\nTY  - JOUR\nER  - ';
    const r = parseRis(src);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('flushes a final entry without ER and emits a warning', () => {
    const src = 'TY  - JOUR\nTI  - never closed\n';
    const r = parseRis(src);
    expect(r.entries).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('ER'))).toBe(true);
  });

  it('routes T2/BT to booktitle for chapters', () => {
    const src = [
      'TY  - CHAP',
      'TI  - Chapter Title',
      'T2  - Handbook of X',
      'PY  - 2024',
      'ER  - ',
    ].join('\n');
    const r = parseRis(src);
    expect(r.entries[0]?.type).toBe('incollection');
    expect(r.entries[0]?.fields.booktitle).toBe('Handbook of X');
  });
});
