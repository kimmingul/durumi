import { describe, it, expect } from 'vitest';
import {
  parseFrontMatter,
  frontMatterString,
  frontMatterRange,
} from '../../shared/frontMatter';

describe('parseFrontMatter', () => {
  it('returns no front matter when the document does not begin with ---', () => {
    const r = parseFrontMatter('# Hello\n\nbody');
    expect(r.data).toBeNull();
    expect(r.body).toBe('# Hello\n\nbody');
    expect(r.endOffset).toBe(0);
    expect(r.error).toBeNull();
  });

  it('parses a simple block and strips it from the body', () => {
    const src = '---\ntitle: Foo\nauthor: Min\n---\n# Body\n';
    const r = parseFrontMatter(src);
    expect(r.data).toEqual({ title: 'Foo', author: 'Min' });
    expect(r.body).toBe('# Body\n');
    expect(r.raw).toBe('---\ntitle: Foo\nauthor: Min\n---\n');
    expect(r.endOffset).toBe(r.raw!.length);
    expect(r.error).toBeNull();
  });

  it('accepts `...` as the closing delimiter (Pandoc style)', () => {
    const src = '---\ntitle: Bar\n...\nbody';
    const r = parseFrontMatter(src);
    expect(r.data).toEqual({ title: 'Bar' });
    expect(r.body).toBe('body');
  });

  it('treats unterminated front matter as no front matter', () => {
    const src = '---\ntitle: Foo\nstill typing';
    const r = parseFrontMatter(src);
    expect(r.data).toBeNull();
    expect(r.endOffset).toBe(0);
    expect(r.body).toBe(src);
  });

  it('returns an error message but no data when YAML is invalid', () => {
    const src = '---\ntitle: : :\n---\nbody';
    const r = parseFrontMatter(src);
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
  });

  it('handles CRLF line endings', () => {
    const src = '---\r\ntitle: Foo\r\n---\r\nbody';
    const r = parseFrontMatter(src);
    expect(r.data).toEqual({ title: 'Foo' });
    expect(r.body).toBe('body');
  });

  it('rejects YAML that parses as an array (must be a mapping)', () => {
    const src = '---\n- a\n- b\n---\nbody';
    const r = parseFrontMatter(src);
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/mapping/);
  });

  it('treats an empty front matter as an empty object', () => {
    const src = '---\n---\nbody';
    const r = parseFrontMatter(src);
    expect(r.data).toEqual({});
    expect(r.body).toBe('body');
  });

  it('does not match a --- that is not the very first line', () => {
    const src = '\n---\ntitle: x\n---\nbody';
    const r = parseFrontMatter(src);
    expect(r.data).toBeNull();
    expect(r.body).toBe(src);
  });
});

describe('frontMatterString', () => {
  it('returns the string value when set', () => {
    const r = parseFrontMatter('---\ntitle: Foo\n---\n');
    expect(frontMatterString(r, 'title')).toBe('Foo');
  });

  it('returns undefined for non-string fields', () => {
    const r = parseFrontMatter('---\ncount: 3\n---\n');
    expect(frontMatterString(r, 'count')).toBeUndefined();
  });

  it('returns undefined when there is no front matter', () => {
    const r = parseFrontMatter('plain');
    expect(frontMatterString(r, 'title')).toBeUndefined();
  });
});

describe('frontMatterRange', () => {
  it('returns null when there is no front matter', () => {
    const r = parseFrontMatter('hello');
    expect(frontMatterRange(r)).toBeNull();
  });
  it('returns the offset range covering the YAML region', () => {
    const r = parseFrontMatter('---\ntitle: x\n---\nrest');
    const range = frontMatterRange(r);
    expect(range).toEqual({ from: 0, to: r.raw!.length });
  });
});
