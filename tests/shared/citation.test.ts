import { describe, it, expect } from 'vitest';
import { parseBibTeX, indexBibEntries } from '../../shared/bibtex';
import {
  applyCitations,
  collectCitationKeys,
  formatBibliography,
} from '../../shared/citation';

describe('collectCitationKeys', () => {
  it('returns keys in the order they first appear', () => {
    const md = 'See [@b] and [@a] then [@b] again.';
    expect(collectCitationKeys(md)).toEqual(['b', 'a']);
  });
  it('expands grouped citations like [@a; @b]', () => {
    expect(collectCitationKeys('Recent work [@a; @b; @c] shows…')).toEqual(['a', 'b', 'c']);
  });
  it('treats [-@key] as the same key', () => {
    expect(collectCitationKeys('As shown earlier [-@smith2023]')).toEqual(['smith2023']);
  });
  it('ignores bare `@` mentions outside square brackets', () => {
    expect(collectCitationKeys('email me @alice')).toEqual([]);
  });
});

describe('applyCitations', () => {
  const numberMap = new Map([['a', 1], ['b', 2]]);

  it('replaces [@key] with a numbered superscript link', () => {
    const html = applyCitations('See [@a] please.', numberMap);
    expect(html).toContain('<sup class="citation"');
    expect(html).toContain('href="#ref-a"');
    expect(html).toContain('>1</a>');
  });

  it('combines multiple keys with commas', () => {
    const html = applyCitations('Refer [@a; @b].', numberMap);
    expect(html).toMatch(/\[<a[^>]*>1<\/a>,<a[^>]*>2<\/a>\]/);
  });

  it('marks unknown keys with a question mark and tooltip', () => {
    const html = applyCitations('Unknown [@xyz].', numberMap);
    expect(html).toContain('citation-missing');
    expect(html).toContain('title="missing: xyz"');
    expect(html).toContain('has-missing');
  });
});

describe('formatBibliography', () => {
  const bib = parseBibTeX(`
    @article{smith2023,
      author = {Smith, John and Doe, Alice and Roe, Mary and Lee, Sun and Park, Min and Kim, Yu and Choi, Bo},
      title = {COVID-19 outcomes},
      journal = {NEJM},
      year = {2023},
      volume = {388},
      number = {12},
      pages = {1101--1110},
      doi = {10.1056/NEJMoa1234567}
    }
    @book{jones2020,
      author = {Jones, Bob},
      title = {A Book},
      publisher = {Acme Press},
      year = {2020}
    }
  `);
  const idx = indexBibEntries(bib);

  it('formats an article with Vancouver-style elements', () => {
    const out = formatBibliography(['smith2023'], idx);
    expect(out).toHaveLength(1);
    const html = out[0]!.html;
    expect(html).toMatch(/Smith J, Doe A/);
    expect(html).toContain('et al');                   // 7 authors > 6
    expect(html).toContain('COVID-19 outcomes.');
    expect(html).toContain('<em>NEJM</em>');
    expect(html).toContain('2023;388(12):1101-1110');
    expect(html).toMatch(/doi:.*10\.1056\/NEJMoa1234567/);
  });

  it('formats a book without journal/volume', () => {
    const out = formatBibliography(['jones2020'], idx);
    const html = out[0]!.html;
    expect(html).toContain('Jones B.');
    expect(html).toContain('A Book.');
    expect(html).toContain('Acme Press; 2020.');
  });

  it('skips unknown keys silently and renumbers', () => {
    const out = formatBibliography(['unknown', 'smith2023'], idx);
    expect(out).toHaveLength(1);
    expect(out[0]!.number).toBe(1);
  });

  it('numbers entries in the order received (citation order, not alphabetical)', () => {
    const out = formatBibliography(['jones2020', 'smith2023'], idx);
    expect(out.map((c) => c.number)).toEqual([1, 2]);
    expect(out[0]!.entry.key).toBe('jones2020');
  });
});
