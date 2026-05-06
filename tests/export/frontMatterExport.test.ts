import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml + front matter', () => {
  it('strips the YAML block and uses the title from front matter', async () => {
    const md = '---\ntitle: From YAML\nauthor: Min\n---\n\n# Heading\n\nBody';
    const html = await renderHtml(md, 'fallback', '');
    expect(html).toContain('<title>From YAML</title>');
    expect(html).toContain('<meta name="author" content="Min">');
    expect(html).not.toContain('From YAML</p>'); // not rendered as a paragraph
    expect(html).toContain('<h1 id="heading">Heading</h1>');
  });

  it('falls back to the caller title when YAML omits a title', async () => {
    const md = '---\nauthor: Min\n---\n# Body';
    const html = await renderHtml(md, 'caller-title', '');
    expect(html).toContain('<title>caller-title</title>');
  });

  it('emits keywords and description meta tags from front matter', async () => {
    const md = '---\ntitle: t\nsubject: an article about cranes\nkeywords: bird, paper\n---\n\n# Body';
    const html = await renderHtml(md, 't', '');
    expect(html).toContain('<meta name="description" content="an article about cranes">');
    expect(html).toContain('<meta name="keywords" content="bird, paper">');
  });

  it('escapes HTML special chars in front matter values', async () => {
    const md = '---\ntitle: "1 < 2 & ok"\nauthor: "<script>"\n---\n# x';
    const html = await renderHtml(md, 'f', '');
    expect(html).toContain('<title>1 &lt; 2 &amp; ok</title>');
    expect(html).toContain('<meta name="author" content="&lt;script&gt;">');
  });

  it('renders normally when there is no front matter', async () => {
    const md = '# Hello\n\nbody';
    const html = await renderHtml(md, 'doc', '');
    expect(html).toContain('<title>doc</title>');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
  });
});
