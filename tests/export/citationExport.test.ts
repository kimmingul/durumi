import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

const SAMPLE_BIB = `
@article{smith2023,
  author = {Smith, John},
  title = {COVID outcomes},
  journal = {NEJM},
  year = {2023},
  volume = {388},
  pages = {1101--1110},
  doi = {10.1056/NEJMoa1234567}
}
@article{doe2022,
  author = {Doe, Alice and Roe, Bob},
  title = {Cohort study},
  journal = {Lancet},
  year = {2022}
}
`;

describe('renderHtml + citations', () => {
  it('replaces [@key] with a numbered superscript and appends References', async () => {
    const md = 'Outcomes [@smith2023] differ from earlier work [@doe2022].';
    const html = await renderHtml(md, 'd', '', { bibliography: SAMPLE_BIB });
    expect(html).toMatch(/href="#ref-smith2023"[^>]*>1<\/a>/);
    expect(html).toMatch(/href="#ref-doe2022"[^>]*>2<\/a>/);
    expect(html).toContain('<section class="references">');
    expect(html).toContain('<h2>References</h2>');
    expect(html).toContain('id="ref-smith2023"');
    expect(html).toContain('id="ref-doe2022"');
  });

  it('numbers entries by citation order, not bib file order', async () => {
    const md = 'See [@doe2022] then [@smith2023].';
    const html = await renderHtml(md, 'd', '', { bibliography: SAMPLE_BIB });
    // doe is cited first → numbered 1
    expect(html).toMatch(/href="#ref-doe2022"[^>]*>1</);
    expect(html).toMatch(/href="#ref-smith2023"[^>]*>2</);
  });

  it('marks unknown keys with [?] but still emits the bibliography for known ones', async () => {
    const md = 'Maybe [@unknown] but [@smith2023] is fine.';
    const html = await renderHtml(md, 'd', '', { bibliography: SAMPLE_BIB });
    expect(html).toContain('citation-missing');
    expect(html).toContain('id="ref-smith2023"');
  });

  it('omits References when no citations resolve', async () => {
    const md = 'Plain document with [@unknown].';
    const html = await renderHtml(md, 'd', '', { bibliography: SAMPLE_BIB });
    expect(html).not.toContain('<section class="references">');
  });

  it('omits References entirely when no bibliography is supplied', async () => {
    const md = 'See [@smith2023].';
    const html = await renderHtml(md, 'd', '');
    expect(html).not.toContain('<section class="references">');
    // The raw [@…] survives since we have no resolver.
    expect(html).toContain('[@smith2023]');
  });

  it('resolves repeated keys to the same number', async () => {
    const md = 'One [@smith2023]. Two [@smith2023]. Three [@doe2022].';
    const html = await renderHtml(md, 'd', '', { bibliography: SAMPLE_BIB });
    const matches = [...html.matchAll(/href="#ref-smith2023"[^>]*>(\d+)</g)];
    expect(matches).toHaveLength(2);
    expect(matches[0]?.[1]).toBe('1');
    expect(matches[1]?.[1]).toBe('1');
  });
});
