import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/export/slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips punctuation but keeps CJK and digits', () => {
    // Em-dash and colon are stripped; runs of whitespace collapse to one hyphen.
    expect(slugify('Section 1: 한글 — 테스트')).toBe('section-1-한글-테스트');
    expect(slugify('A.B,C')).toBe('abc');
    expect(slugify('foo & bar')).toBe('foo-bar');
  });
  it('falls back to "section" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('section');
  });
  it('disambiguates duplicates via the seen map', () => {
    const seen = new Map<string, number>();
    expect(slugify('Methods', seen)).toBe('methods');
    expect(slugify('Methods', seen)).toBe('methods-1');
    expect(slugify('Methods', seen)).toBe('methods-2');
  });
});
