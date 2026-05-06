import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml + GitHub-style alerts', () => {
  for (const [type, cssClass] of [
    ['NOTE', 'markdown-alert-note'],
    ['TIP', 'markdown-alert-tip'],
    ['IMPORTANT', 'markdown-alert-important'],
    ['WARNING', 'markdown-alert-warning'],
    ['CAUTION', 'markdown-alert-caution'],
  ] as const) {
    it(`renders [!${type}] with the ${cssClass} class`, async () => {
      const md = `> [!${type}]\n> Sample text.`;
      const html = await renderHtml(md, 'd', '');
      expect(html).toContain(cssClass);
      expect(html).toContain('Sample text.');
    });
  }

  it('falls back to a normal blockquote when the marker is invalid', async () => {
    const html = await renderHtml('> [!UNKNOWN]\n> hi', 'd', '');
    // CSS still references the class names; check for absence in the body.
    const bodyStart = html.indexOf('<body>');
    const body = html.slice(bodyStart);
    expect(body).not.toContain('markdown-alert-');
    expect(body).toContain('<blockquote>');
  });
});
