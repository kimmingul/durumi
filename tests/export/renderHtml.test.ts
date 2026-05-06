import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml', () => {
  it('wraps body in a complete HTML document with title', async () => {
    const html = await renderHtml('# Hello', 'My Doc');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<title>My Doc</title>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<style>');
  });

  it('escapes the document title', async () => {
    const html = await renderHtml('# x', '<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<title><script>');
  });

  it('renders GFM table to <table>', async () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const html = await renderHtml(md, 't');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders task list as input checkboxes', async () => {
    const md = '- [ ] todo\n- [x] done';
    const html = await renderHtml(md, 't');
    expect(html).toContain('<input');
    // Count <input ... type="checkbox"> tags (exclude any selector strings inside CSS).
    expect(html.match(/<input[^>]*type="checkbox"/g)?.length).toBe(2);
    expect(html).toMatch(/checked|disabled/);
  });

  it('renders strikethrough as <s> or <del>', async () => {
    const md = '~~gone~~';
    const html = await renderHtml(md, 't');
    expect(html).toMatch(/<(s|del)>gone<\/(s|del)>/);
  });

  it('renders ts code block with token spans (after lang prefetch)', async () => {
    const md = '```typescript\nconst x = 1;\n```';
    const html = await renderHtml(md, 't');
    expect(html).toContain('class="cm-tok-keyword"');
    expect(html).toContain('const');
  });

  it('falls back gracefully on unknown lang', async () => {
    const md = '```weirdlang\nbody\n```';
    const html = await renderHtml(md, 't');
    expect(html).toContain('body');
    expect(html).not.toContain('class="cm-tok-');
  });

  it('linkifies bare URLs', async () => {
    const html = await renderHtml('See https://example.com here.', 't');
    expect(html).toContain('href="https://example.com"');
  });

  it('appends custom CSS into the <style> block when provided', async () => {
    const customCss = '.export-content h1 { color: #c33; }';
    const html = await renderHtml('# Hello', 't', customCss);
    expect(html).toContain(customCss);
    // The user CSS lives inside the same <style> tag as the export styles.
    const styleStart = html.indexOf('<style>');
    const styleEnd = html.indexOf('</style>');
    expect(styleStart).toBeGreaterThan(-1);
    expect(html.slice(styleStart, styleEnd)).toContain(customCss);
  });

  it('omits the custom CSS block when not provided', async () => {
    const html = await renderHtml('# Hello', 't');
    expect(html).not.toContain('.export-content h1 { color: #c33; }');
  });
});
