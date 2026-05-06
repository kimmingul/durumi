import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml + footnotes', () => {
  it('renders a reference as a superscript link and a numbered definition section', async () => {
    const md = 'See note[^a] in body.\n\n[^a]: explanation here.\n';
    const html = await renderHtml(md, 'doc', '');
    // Reference becomes <sup><a href="#fn1" id="fnref1">…
    expect(html).toMatch(/<sup\b[^>]*class="footnote-ref"[^>]*>/);
    expect(html).toContain('href="#fn1"');
    // Definition block at the bottom
    expect(html).toMatch(/<section\b[^>]*class="footnotes"/);
    expect(html).toContain('explanation here.');
  });

  it('preserves footnote ordering by reference position', async () => {
    const md = 'A[^one] then B[^two].\n\n[^two]: second\n[^one]: first\n';
    const html = await renderHtml(md, 'doc', '');
    // First reference -> fn1, second -> fn2 by reference order
    const fn1Idx = html.indexOf('id="fn1"');
    const fn2Idx = html.indexOf('id="fn2"');
    expect(fn1Idx).toBeGreaterThan(0);
    expect(fn2Idx).toBeGreaterThan(fn1Idx);
    // The "first" text should land in fn1 since `one` is referenced first.
    const fn1Block = html.slice(fn1Idx, fn2Idx > fn1Idx ? fn2Idx : html.length);
    expect(fn1Block).toContain('first');
  });

  it('handles a missing definition gracefully (treats as plain text)', async () => {
    const md = 'orphan[^x] reference\n';
    const html = await renderHtml(md, 'doc', '');
    expect(html).toContain('orphan[^x]');
    expect(html).not.toContain('class="footnotes"');
  });
});
