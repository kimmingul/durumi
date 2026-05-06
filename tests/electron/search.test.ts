import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchInWorkspace, buildMatcher } from '../../electron/search';

describe('buildMatcher', () => {
  it('returns null for an empty query', () => {
    expect(buildMatcher({ query: '' })).toBeNull();
  });
  it('builds a case-insensitive matcher by default', () => {
    const r = buildMatcher({ query: 'foo' });
    expect(r?.flags).toContain('i');
    expect(r?.flags).toContain('g');
  });
  it('respects caseSensitive=true', () => {
    const r = buildMatcher({ query: 'foo', caseSensitive: true });
    expect(r?.flags).not.toContain('i');
  });
  it('escapes special chars in plain mode', () => {
    const r = buildMatcher({ query: 'a.b' });
    expect(r?.test('a.b')).toBe(true);
    expect(r?.test('axb')).toBe(false);
  });
  it('passes through pattern in regex mode', () => {
    const r = buildMatcher({ query: 'a.b', regex: true });
    expect(r?.test('axb')).toBe(true);
  });
  it('adds word boundaries when wholeWord=true', () => {
    const r = buildMatcher({ query: 'foo', wholeWord: true });
    expect(r?.test('foo bar')).toBe(true);
    expect(r?.test('foobar')).toBe(false);
  });
  it('returns null for invalid regex sources', () => {
    expect(buildMatcher({ query: '(', regex: true })).toBeNull();
  });
});

describe('searchInWorkspace', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'durumi-search-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('finds matches across nested markdown files', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'a.md'), '# Title\n\nfoo bar baz\n');
    await writeFile(join(dir, 'sub', 'b.md'), '## Other\n\nfoo here too\n');
    const hits = await searchInWorkspace(dir, { query: 'foo' });
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.relPath).sort()).toEqual(['a.md', 'sub/b.md']);
  });

  it('skips excluded directories', async () => {
    await mkdir(join(dir, 'node_modules'));
    await writeFile(join(dir, 'node_modules', 'x.md'), 'foo\n');
    await writeFile(join(dir, 'kept.md'), 'foo\n');
    const hits = await searchInWorkspace(dir, { query: 'foo' });
    expect(hits.map((h) => h.relPath)).toEqual(['kept.md']);
  });

  it('skips non-text extensions', async () => {
    await writeFile(join(dir, 'k.md'), 'foo\n');
    await writeFile(join(dir, 'k.png'), 'foo\n');
    const hits = await searchInWorkspace(dir, { query: 'foo' });
    expect(hits.length).toBe(1);
  });

  it('records 1-based line numbers and 0-based columns', async () => {
    await writeFile(join(dir, 'a.md'), 'line1\nXX foo YY\n');
    const hits = await searchInWorkspace(dir, { query: 'foo' });
    expect(hits[0]?.line).toBe(2);
    expect(hits[0]?.column).toBe(3);
    expect(hits[0]?.matchLength).toBe(3);
  });

  it('honours regex mode', async () => {
    await writeFile(join(dir, 'a.md'), 'cat\ncot\ncut\n');
    const hits = await searchInWorkspace(dir, { query: 'c.t', regex: true });
    expect(hits.length).toBe(3);
  });

  it('returns no results for an empty query', async () => {
    await writeFile(join(dir, 'a.md'), 'anything');
    const hits = await searchInWorkspace(dir, { query: '' });
    expect(hits).toEqual([]);
  });
});
