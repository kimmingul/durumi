import { describe, it, expect } from 'vitest';
import { bucketForEntry, relativeFromRoot } from '../../src/components/sidebar/gitStatus';
import type { DirEntry } from '@shared/ipc-contract';

const file = (path: string, name = path.split('/').pop()!): DirEntry => ({
  path,
  name,
  isDir: false,
  mtimeMs: 0,
});

const dir = (path: string, name = path.split('/').pop()!): DirEntry => ({
  path,
  name,
  isDir: true,
  mtimeMs: 0,
});

describe('relativeFromRoot', () => {
  it('returns a posix relative path', () => {
    expect(relativeFromRoot('/Users/me/repo', '/Users/me/repo/src/a.md')).toBe('src/a.md');
  });
  it('returns empty string when path equals root', () => {
    expect(relativeFromRoot('/Users/me/repo', '/Users/me/repo')).toBe('');
  });
  it('returns null when path is not under the root', () => {
    expect(relativeFromRoot('/Users/me/repo', '/Users/me/elsewhere/a.md')).toBeNull();
  });
  it('handles Windows-style backslash separators', () => {
    expect(relativeFromRoot('C:\\repo', 'C:\\repo\\src\\a.md')).toBe('src/a.md');
  });
});

describe('bucketForEntry — file', () => {
  it('returns the matching bucket for a file', () => {
    const result = bucketForEntry(
      file('/repo/foo.md'),
      '/repo',
      { 'foo.md': 'modified' },
      new Map(),
    );
    expect(result).toBe('modified');
  });

  it('returns null when status map has no entry for that file', () => {
    const result = bucketForEntry(
      file('/repo/clean.md'),
      '/repo',
      { 'other.md': 'modified' },
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('returns null when statuses are undefined (not yet fetched)', () => {
    const result = bucketForEntry(file('/repo/foo.md'), '/repo', undefined, new Map());
    expect(result).toBeNull();
  });

  it('returns null when the file is outside the root', () => {
    const result = bucketForEntry(
      file('/elsewhere/foo.md'),
      '/repo',
      { 'foo.md': 'modified' },
      new Map(),
    );
    expect(result).toBeNull();
  });
});

describe('bucketForEntry — folder aggregation', () => {
  it('reports modified for a folder with a modified descendant', () => {
    const result = bucketForEntry(
      dir('/repo/src'),
      '/repo',
      { 'src/a.md': 'modified' },
      new Map(),
    );
    expect(result).toBe('modified');
  });

  it('returns null for a folder with no descendants in the status map', () => {
    const result = bucketForEntry(
      dir('/repo/src'),
      '/repo',
      { 'docs/a.md': 'modified' },
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('picks the highest-priority bucket: modified > untracked', () => {
    const result = bucketForEntry(
      dir('/repo/src'),
      '/repo',
      { 'src/a.md': 'untracked', 'src/sub/b.md': 'modified' },
      new Map(),
    );
    expect(result).toBe('modified');
  });

  it('priority order: modified > added > deleted > renamed > untracked > ignored', () => {
    const allBuckets = {
      'src/m.md': 'modified',
      'src/a.md': 'added',
      'src/d.md': 'deleted',
      'src/r.md': 'renamed',
      'src/u.md': 'untracked',
      'src/i.md': 'ignored',
    };
    expect(
      bucketForEntry(dir('/repo/src'), '/repo', allBuckets, new Map()),
    ).toBe('modified');
    const noModified = { ...allBuckets } as Record<string, string>;
    delete noModified['src/m.md'];
    expect(bucketForEntry(dir('/repo/src'), '/repo', noModified, new Map())).toBe('added');
  });
});
