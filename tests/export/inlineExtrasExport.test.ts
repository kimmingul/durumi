import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml + inline extras', () => {
  it('renders ==text== as <mark>', async () => {
    const html = await renderHtml('this is ==important== stuff', 'd', '');
    expect(html).toMatch(/<mark>important<\/mark>/);
  });

  it('renders H~2~O as subscript', async () => {
    const html = await renderHtml('H~2~O', 'd', '');
    expect(html).toContain('<sub>2</sub>');
  });

  it('renders X^2^ as superscript', async () => {
    const html = await renderHtml('X^2^', 'd', '');
    expect(html).toContain('<sup>2</sup>');
  });

  it('keeps strikethrough when ~~ is used', async () => {
    const html = await renderHtml('~~gone~~', 'd', '');
    expect(html).toMatch(/<(s|del)>gone<\/(s|del)>/);
  });

  it('combines highlight, sub, and sup in one paragraph', async () => {
    const html = await renderHtml('See ==Na^+^== and H~2~O.', 'd', '');
    expect(html).toContain('<mark>Na<sup>+</sup></mark>');
    expect(html).toContain('H<sub>2</sub>O');
  });
});
