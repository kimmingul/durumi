import { describe, it, expect, vi } from 'vitest';
import { inlineImagesInHtml, type ImageFetcher } from '../../src/export/inlineImages';

const HELLO_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HELLO_BASE64 = 'iVBORw0KGgo=';

function staticFetcher(map: Record<string, { bytes: Uint8Array; mime: string }>): ImageFetcher {
  return async (url) => {
    const hit = map[url];
    if (!hit) return { ok: false };
    return { ok: true as const, ...hit };
  };
}

describe('inlineImagesInHtml', () => {
  it('returns html unchanged when no <img> tags present', async () => {
    const html = '<p>plain text</p>';
    const out = await inlineImagesInHtml(html, { docPath: '/doc/manuscript.md' });
    expect(out).toBe(html);
  });

  it('rewrites a relative <img src> to a data: URI', async () => {
    const html = '<p><img src="assets/fig1.png" alt="fig"></p>';
    const fetcher = staticFetcher({
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/assets/fig1.png')}`]: {
        bytes: HELLO_PNG_BYTES,
        mime: 'image/png',
      },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/manuscript.md', fetcher });
    expect(out).toContain(`data:image/png;base64,${HELLO_BASE64}`);
    expect(out).toContain('alt="fig"');
    expect(out).not.toContain('assets/fig1.png');
  });

  it('rewrites a durumi-asset:// URL', async () => {
    const html = '<img src="durumi-asset://x/?p=%2Fdoc%2Fa.png" />';
    const fetcher = staticFetcher({
      'durumi-asset://x/?p=%2Fdoc%2Fa.png': { bytes: HELLO_PNG_BYTES, mime: 'image/png' },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toContain(`data:image/png;base64,${HELLO_BASE64}`);
  });

  it('leaves http(s) URLs untouched', async () => {
    const html = '<img src="https://example.com/x.png">';
    const fetcher = vi.fn();
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toBe(html);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('leaves data: URIs untouched (idempotent)', async () => {
    const html = '<img src="data:image/png;base64,AAAA">';
    const fetcher = vi.fn();
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toBe(html);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('warns and skips when the fetch fails (does not throw)', async () => {
    const html = '<img src="assets/missing.png">';
    const warn = vi.fn();
    const fetcher: ImageFetcher = async () => ({ ok: false });
    const out = await inlineImagesInHtml(html, {
      docPath: '/doc/m.md',
      fetcher,
      warn,
    });
    expect(out).toBe(html);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skip assets/missing.png'));
  });

  it('skips a relative src when docPath is null and warns', async () => {
    const html = '<img src="assets/x.png">';
    const warn = vi.fn();
    const fetcher = vi.fn();
    const out = await inlineImagesInHtml(html, { docPath: null, fetcher, warn });
    expect(out).toBe(html);
    expect(fetcher).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no doc path'));
  });

  it('inlines multiple <img> tags in one pass', async () => {
    const html = '<img src="a.png"><p>text</p><img src="b.jpg">';
    const fetcher = staticFetcher({
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/a.png')}`]: {
        bytes: HELLO_PNG_BYTES,
        mime: 'image/png',
      },
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/b.jpg')}`]: {
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        mime: 'image/jpeg',
      },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    const dataMatches = out.match(/data:image\//g) ?? [];
    expect(dataMatches.length).toBe(2);
    expect(out).toContain('data:image/png;base64,');
    expect(out).toContain('data:image/jpeg;base64,');
  });

  it('honours fetcher mime over extension fallback', async () => {
    const html = '<img src="weird.bin">';
    const fetcher = staticFetcher({
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/weird.bin')}`]: {
        bytes: HELLO_PNG_BYTES,
        mime: 'image/svg+xml',
      },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toContain('data:image/svg+xml;base64,');
  });

  it('preserves attribute order and other attributes', async () => {
    const html = '<img class="hero" src="a.png" alt="x" width="100">';
    const fetcher = staticFetcher({
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/a.png')}`]: {
        bytes: HELLO_PNG_BYTES,
        mime: 'image/png',
      },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toMatch(/class="hero"[^>]*src="data:image\/png[^"]*"[^>]*alt="x"[^>]*width="100"/);
  });

  it('skips an oversized image (>25MB) with a cap warning', async () => {
    const html = '<img src="durumi-asset://x/?p=%2Fdoc%2Fbig.png">';
    const big = new Uint8Array(30 * 1024 * 1024);
    const fetcher: ImageFetcher = async () => ({
      ok: true as const,
      bytes: big,
      mime: 'image/png',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await inlineImagesInHtml(html, {
        docPath: '/doc/m.md',
        fetcher,
      });
      expect(out).toBe(html);
      expect(out).toContain('durumi-asset://x/?p=%2Fdoc%2Fbig.png');
      expect(out).not.toContain('data:image/png;base64,');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${big.length} bytes exceeds ${25 * 1024 * 1024} byte cap`),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('handles SVG files', async () => {
    const html = '<img src="diagram.svg">';
    const svgBytes = new TextEncoder().encode('<svg/>');
    const fetcher = staticFetcher({
      [`durumi-asset://x/?p=${encodeURIComponent('/doc/diagram.svg')}`]: {
        bytes: svgBytes,
        mime: 'image/svg+xml',
      },
    });
    const out = await inlineImagesInHtml(html, { docPath: '/doc/m.md', fetcher });
    expect(out).toContain('data:image/svg+xml;base64,');
  });
});
