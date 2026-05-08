import { describe, it, expect } from 'vitest';
import {
  basenameOf,
  dirnameOf,
  joinPath,
  relativePathOf,
  stripMarkdownExt,
} from '../../src/utils/path';

describe('basenameOf', () => {
  it('returns the last path segment', () => {
    expect(basenameOf('/a/b/c.md')).toBe('c.md');
    expect(basenameOf('C:\\a\\b\\c.md')).toBe('c.md');
  });
  it('falls back when given null', () => {
    expect(basenameOf(null)).toBe('untitled.md');
    expect(basenameOf(null, 'x')).toBe('x');
  });
});

describe('stripMarkdownExt', () => {
  it('strips .md and .markdown', () => {
    expect(stripMarkdownExt('a.md')).toBe('a');
    expect(stripMarkdownExt('a.markdown')).toBe('a');
    expect(stripMarkdownExt('a.txt')).toBe('a.txt');
  });
});

describe('dirnameOf', () => {
  it('returns the parent dir for POSIX paths', () => {
    expect(dirnameOf('/a/b/c.md')).toBe('/a/b');
    expect(dirnameOf('/a/b/')).toBe('/a');
  });
  it('returns the parent dir for Windows-style paths', () => {
    expect(dirnameOf('C:\\a\\b\\c.md')).toBe('C:\\a\\b');
  });
  it('returns the root separator for top-level entries', () => {
    expect(dirnameOf('/a')).toBe('/');
  });
  it('returns empty when there is no separator', () => {
    expect(dirnameOf('foo.md')).toBe('');
    expect(dirnameOf('')).toBe('');
  });
});

describe('joinPath', () => {
  it('joins with the directory separator style', () => {
    expect(joinPath('/a/b', 'c.md')).toBe('/a/b/c.md');
    expect(joinPath('C:\\a\\b', 'c.md')).toBe('C:\\a\\b\\c.md');
  });
  it('drops trailing separators on the directory', () => {
    expect(joinPath('/a/b/', 'c.md')).toBe('/a/b/c.md');
    expect(joinPath('/a/b//', 'c.md')).toBe('/a/b/c.md');
  });
  it('handles the root dir specially', () => {
    expect(joinPath('/', 'c.md')).toBe('/c.md');
  });
});

describe('relativePathOf', () => {
  it('returns the path relative to root', () => {
    expect(relativePathOf('/a/b', '/a/b/c.md')).toBe('c.md');
    expect(relativePathOf('/a/b', '/a/b/sub/c.md')).toBe('sub/c.md');
  });
  it('handles Windows-style separators', () => {
    expect(relativePathOf('C:\\a\\b', 'C:\\a\\b\\c.md')).toBe('c.md');
  });
  it('returns empty when child equals root', () => {
    expect(relativePathOf('/a/b', '/a/b')).toBe('');
  });
  it('returns the absolute path when the child is outside the root', () => {
    expect(relativePathOf('/a/b', '/x/y/c.md')).toBe('/x/y/c.md');
  });
});
