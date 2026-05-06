import { describe, it, expect } from 'vitest';
import { prefetchLang, highlightCodeSync, getLangCacheForTest } from '../../src/export/highlightCode';

describe('highlightCode', () => {
  it('returns escaped plain HTML for empty lang', () => {
    expect(highlightCodeSync('const x = 1', '')).toBe('const x = 1');
    expect(highlightCodeSync('a < b', '')).toBe('a &lt; b');
  });

  it('returns escaped plain HTML for an unknown lang', () => {
    expect(highlightCodeSync('hi', 'weirdlang')).toBe('hi');
  });

  it('after prefetching ts, wraps "const" in cm-tok-keyword span', async () => {
    await prefetchLang('typescript');
    const out = highlightCodeSync('const x = 1;', 'typescript');
    expect(out).toContain('<span class="cm-tok-keyword">const</span>');
    expect(out).toContain('<span class="cm-tok-number">1</span>');
  });

  it('escapes HTML inside spans', async () => {
    await prefetchLang('typescript');
    const out = highlightCodeSync('a < b', 'typescript');
    expect(out).toContain('&lt;');
    expect(out).not.toContain('<b>');
  });

  it('cache: prefetching twice does not throw', async () => {
    await prefetchLang('typescript');
    await prefetchLang('typescript');
    expect(getLangCacheForTest().size).toBeGreaterThan(0);
  });
});
