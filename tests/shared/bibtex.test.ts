import { describe, it, expect } from 'vitest';
import { parseBibTeX, indexBibEntries } from '../../shared/bibtex';

describe('parseBibTeX', () => {
  it('parses a single article entry with the common fields', () => {
    const src = `@article{smith2023covid,
      author = {Smith, John and Doe, Alice},
      title = {COVID outcomes in patients},
      journal = {NEJM},
      year = {2023},
      volume = {388},
      number = {12},
      pages = {1101--1110},
      doi = {10.1056/NEJMoa1234567}
    }`;
    const r = parseBibTeX(src);
    expect(r.warnings).toEqual([]);
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0]!;
    expect(e.key).toBe('smith2023covid');
    expect(e.type).toBe('article');
    expect(e.fields.author).toBe('Smith, John and Doe, Alice');
    expect(e.fields.title).toBe('COVID outcomes in patients');
    expect(e.fields.pages).toBe('1101--1110');
  });

  it('handles `@type(…)` parens form and trailing commas', () => {
    const src = `@book(jones2020,
      title = {A Book},
      year = {2020},
    )`;
    const r = parseBibTeX(src);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]?.fields.title).toBe('A Book');
  });

  it('strips outer braces but preserves protected casing', () => {
    const src = `@article{x, title = {On {NASA} mission}, journal = {J} }`;
    const r = parseBibTeX(src);
    expect(r.entries[0]?.fields.title).toBe('On NASA mission');
  });

  it('handles quoted-string values and concatenation', () => {
    const src = `@article{x, title = "Part one" # " of two", year = 2024 }`;
    const r = parseBibTeX(src);
    expect(r.entries[0]?.fields.title).toBe('Part one  of two');
    expect(r.entries[0]?.fields.year).toBe('2024');
  });

  it('skips @string and @comment blocks', () => {
    const src = `@string{nejm = "NEJM"}
@comment{ignore me}
@article{x, title = {Real}, year = 2024}`;
    const r = parseBibTeX(src);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]?.key).toBe('x');
  });

  it('parses multiple consecutive entries', () => {
    const src = `@article{a, title={A}}
@article{b, title={B}}
@book{c, title={C}}`;
    const r = parseBibTeX(src);
    expect(r.entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    expect(r.entries.map((e) => e.type)).toEqual(['article', 'article', 'book']);
  });

  it('records a warning for an entry missing its citation key', () => {
    const src = `@article{ , title={x} }`;
    const r = parseBibTeX(src);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('survives unbalanced braces without throwing', () => {
    const src = `@article{x, title = { unclosed `;
    expect(() => parseBibTeX(src)).not.toThrow();
  });

  it('indexBibEntries builds a key map', () => {
    const r = parseBibTeX('@article{a, title={A}} @article{b, title={B}}');
    const m = indexBibEntries(r);
    expect(m.size).toBe(2);
    expect(m.get('a')?.fields.title).toBe('A');
  });
});
