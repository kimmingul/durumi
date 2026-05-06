import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzyRank } from '../../src/utils/fuzzy';

describe('fuzzyMatch', () => {
  it('returns indices for a contiguous match', () => {
    const r = fuzzyMatch('foo', 'foobar');
    expect(r?.indices).toEqual([0, 1, 2]);
  });

  it('matches subsequence with gaps', () => {
    const r = fuzzyMatch('fbr', 'foobar');
    expect(r?.indices).toEqual([0, 3, 5]);
  });

  it('returns null when query characters do not appear in order', () => {
    expect(fuzzyMatch('xyz', 'foobar')).toBeNull();
    expect(fuzzyMatch('rb', 'foobar')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(fuzzyMatch('FOO', 'foobar')?.indices).toEqual([0, 1, 2]);
  });

  it('scores word-boundary matches higher than mid-word matches', () => {
    const start = fuzzyMatch('intro', 'intro/methods.md');
    const middle = fuzzyMatch('intro', 'docs/something/intro.md');
    expect(start && middle && start.score).toBeGreaterThan(middle?.score ?? -Infinity);
  });

  it('scores contiguous matches higher than scattered ones', () => {
    const cont = fuzzyMatch('met', 'methods.md');
    const scat = fuzzyMatch('met', 'measurement.md');
    expect(cont && scat && cont.score).toBeGreaterThan(scat?.score ?? -Infinity);
  });
});

describe('fuzzyRank', () => {
  const items = ['intro.md', 'methods.md', 'results.md', 'sub/intro-extra.md'];

  it('returns all items in original order for an empty query', () => {
    const r = fuzzyRank('', items, (s) => s);
    expect(r.map((x) => x.item)).toEqual(items);
  });

  it('drops misses and orders by descending score', () => {
    const r = fuzzyRank('intro', items, (s) => s);
    expect(r[0]?.item).toBe('intro.md');
    expect(r.length).toBe(2); // intro.md + sub/intro-extra.md
  });
});
