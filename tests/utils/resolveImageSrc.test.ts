import { describe, it, expect } from 'vitest';
import { ASSET_SCHEME, assetUrlFor } from '../../shared/assetProtocol';
import { resolveImageSrc } from '../../src/utils/resolveImageSrc';

describe('assetUrlFor', () => {
  it('builds a durumi-asset://x/?p=… URL with the absolute path in the query', () => {
    const url = assetUrlFor('/Users/min/Documents/manuscript/assets/img.png');
    expect(url.startsWith(`${ASSET_SCHEME}://x/?p=`)).toBe(true);
    // The path lives in the query string (not the pathname) so Chromium's
    // standard-scheme URL parser cannot normalise %2F → / and corrupt the
    // absolute path. searchParams.get('p') round-trips it unchanged.
    const parsed = new URL(url);
    expect(parsed.searchParams.get('p')).toBe('/Users/min/Documents/manuscript/assets/img.png');
  });

  it('escapes spaces and unicode', () => {
    const url = assetUrlFor('/path/with space/한글.png');
    expect(url).toBe(`${ASSET_SCHEME}://x/?p=${encodeURIComponent('/path/with space/한글.png')}`);
    expect(new URL(url).searchParams.get('p')).toBe('/path/with space/한글.png');
  });
});

describe('resolveImageSrc — pass-through cases', () => {
  it('passes http:// URLs untouched', () => {
    expect(resolveImageSrc('http://example.com/x.png', null)).toBe('http://example.com/x.png');
    expect(resolveImageSrc('https://example.com/x.png', null)).toBe('https://example.com/x.png');
  });

  it('passes data: URLs untouched', () => {
    const data = 'data:image/png;base64,iVBOR...';
    expect(resolveImageSrc(data, '/doc.md')).toBe(data);
  });

  it('passes file:// URLs untouched (caller already resolved)', () => {
    expect(resolveImageSrc('file:///abs/path.png', '/doc.md')).toBe('file:///abs/path.png');
  });

  it('passes already-wrapped durumi-asset:// URLs untouched', () => {
    const u = assetUrlFor('/Users/x/y.png');
    expect(resolveImageSrc(u, null)).toBe(u);
  });

  it('passes blob: URLs untouched (paste-from-clipboard intermediate)', () => {
    expect(resolveImageSrc('blob:http://localhost/abc', null)).toBe('blob:http://localhost/abc');
  });

  it('returns an empty string unchanged', () => {
    expect(resolveImageSrc('', '/doc.md')).toBe('');
  });
});

describe('resolveImageSrc — absolute filesystem paths', () => {
  it('wraps a POSIX absolute path in durumi-asset://', () => {
    expect(resolveImageSrc('/Users/min/img.png', null)).toBe(assetUrlFor('/Users/min/img.png'));
  });

  it('wraps a Windows drive-letter path (forward slash variant)', () => {
    expect(resolveImageSrc('C:/Users/min/img.png', null)).toBe(assetUrlFor('C:/Users/min/img.png'));
  });

  it('wraps a Windows drive-letter path (backslash variant)', () => {
    expect(resolveImageSrc('C:\\Users\\min\\img.png', null)).toBe(
      assetUrlFor('C:\\Users\\min\\img.png'),
    );
  });

  it('wraps a Windows UNC path', () => {
    expect(resolveImageSrc('\\\\server\\share\\img.png', null)).toBe(
      assetUrlFor('\\\\server\\share\\img.png'),
    );
  });
});

describe('resolveImageSrc — relative paths against docPath', () => {
  it('resolves assets/img.png against the doc directory', () => {
    expect(resolveImageSrc('assets/img.png', '/Users/min/manuscript.md')).toBe(
      assetUrlFor('/Users/min/assets/img.png'),
    );
  });

  it('resolves leading-dot relative paths', () => {
    expect(resolveImageSrc('./figs/fig1.png', '/Users/min/manuscript.md')).toBe(
      assetUrlFor('/Users/min/./figs/fig1.png'),
    );
  });

  it('returns the original src when no docPath is available', () => {
    // New unsaved buffer: no resolution possible. Returning the original
    // `<img src="…">` will fail to load — correct UX, since the file has
    // no anchor to resolve relative paths against.
    expect(resolveImageSrc('assets/img.png', null)).toBe('assets/img.png');
  });

  it('resolves correctly when docPath uses Windows separators', () => {
    expect(resolveImageSrc('assets\\img.png', 'C:\\Users\\min\\manuscript.md')).toBe(
      assetUrlFor('C:\\Users\\min\\assets\\img.png'),
    );
  });

  it('a renderer-side traversal attempt produces a URL the main-side guard will reject', () => {
    // resolveImageSrc itself is purely a URL builder. A `../../../etc/passwd`
    // in the markdown gets joined naively and encoded, and the main-side
    // assetProtocol handler runs assertAllowedPath which rejects with 403.
    // Documented here so a future refactor doesn't shift defense to the
    // renderer.
    const malicious = '../../../etc/passwd';
    const out = resolveImageSrc(malicious, '/Users/min/manuscript.md');
    expect(out.startsWith(`${ASSET_SCHEME}://x/?p=`)).toBe(true);
  });
});
