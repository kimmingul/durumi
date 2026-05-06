import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml + [toc]', () => {
  it('replaces [toc] with a nested nav linked to heading anchors', async () => {
    const md = '[toc]\n\n# Intro\n\n## Methods\n\n# Results\n';
    const html = await renderHtml(md, 'd', '');
    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('href="#intro"');
    expect(html).toContain('href="#methods"');
    expect(html).toContain('href="#results"');
    // Methods is nested under Intro
    expect(html.indexOf('<li class="toc-h2">')).toBeGreaterThan(html.indexOf('<li class="toc-h1">'));
    // Headings get matching IDs
    expect(html).toContain('<h1 id="intro">Intro</h1>');
    expect(html).toContain('<h2 id="methods">Methods</h2>');
  });

  it('case-insensitive [TOC] also matches', async () => {
    const md = '[TOC]\n\n# A\n';
    const html = await renderHtml(md, 'd', '');
    expect(html).toContain('<nav class="toc">');
  });

  it('renders an empty TOC placeholder when there are no headings', async () => {
    const md = '[toc]\n\nplain body';
    const html = await renderHtml(md, 'd', '');
    expect(html).toContain('toc-empty');
  });

  it('disambiguates duplicate headings with -1 / -2 suffixes', async () => {
    const md = '[toc]\n\n# Methods\n\n# Methods\n';
    const html = await renderHtml(md, 'd', '');
    expect(html).toContain('href="#methods"');
    expect(html).toContain('href="#methods-1"');
    expect(html).toContain('id="methods"');
    expect(html).toContain('id="methods-1"');
  });

  it('does not strip a [toc] inside an inline context', async () => {
    const md = 'inline [toc] reference\n\n# A\n';
    const html = await renderHtml(md, 'd', '');
    // The `[toc]` mid-paragraph is left as text; the heading is still rendered.
    expect(html).toContain('inline [toc] reference');
    expect(html).not.toMatch(/<nav class="toc">/);
  });
});
