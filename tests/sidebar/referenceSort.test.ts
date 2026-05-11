import { describe, it, expect } from 'vitest';
import type { BibEntry } from '../../shared/bibtex';
import {
  sortReferences,
  type SortBy,
} from '../../src/components/sidebar/referenceSort';

function entry(
  key: string,
  fields: Partial<BibEntry['fields']> = {},
): BibEntry {
  return { key, type: 'article', fields: { ...fields } as Record<string, string> };
}

function appendMap(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  keys.forEach((k, i) => m.set(k, i));
  return m;
}

function run(
  entries: BibEntry[],
  sortBy: SortBy,
  ctx: { docText?: string; order?: string[] } = {},
): string[] {
  const order = ctx.order ?? entries.map((e) => e.key);
  return sortReferences(entries, sortBy, {
    docText: ctx.docText ?? '',
    appendIndex: appendMap(order),
  }).map((e) => e.key);
}

const e1 = entry('alpha2020', { author: 'Smith, John', year: '2020', title: 'A' });
const e2 = entry('bravo2018', { author: 'Adams, Mary', year: '2018', title: 'B' });
const e3 = entry('charlie2022', { author: 'Zhao, Lin', year: '2022', title: 'C' });
const e4 = entry('delta', { author: '', year: '', title: 'D' });

const SAMPLE = [e1, e2, e3, e4];

describe('sortReferences', () => {
  it('addedDesc returns reverse append order', () => {
    expect(run(SAMPLE, 'addedDesc')).toEqual(['delta', 'charlie2022', 'bravo2018', 'alpha2020']);
  });

  it('addedAsc returns append order as recorded', () => {
    expect(run(SAMPLE, 'addedAsc')).toEqual(['alpha2020', 'bravo2018', 'charlie2022', 'delta']);
  });

  it('author sorts by first-author surname A->Z, empties last', () => {
    expect(run(SAMPLE, 'author')).toEqual([
      'bravo2018', // Adams
      'alpha2020', // Smith
      'charlie2022', // Zhao
      'delta', // empty -> last
    ]);
  });

  it('yearDesc sorts newest first, missing year last', () => {
    expect(run(SAMPLE, 'yearDesc')).toEqual([
      'charlie2022',
      'alpha2020',
      'bravo2018',
      'delta',
    ]);
  });

  it('yearAsc sorts oldest first, missing year still last', () => {
    expect(run(SAMPLE, 'yearAsc')).toEqual([
      'bravo2018',
      'alpha2020',
      'charlie2022',
      'delta',
    ]);
  });

  it('key sorts by citation key A->Z (case-insensitive locale compare)', () => {
    expect(run(SAMPLE, 'key')).toEqual(['alpha2020', 'bravo2018', 'charlie2022', 'delta']);
  });

  it('citationOrder uses first appearance in docText; uncited go last (addedDesc fallback)', () => {
    // charlie cited first, then alpha. bravo + delta uncited -> addedDesc fallback.
    const doc = 'See [@charlie2022] and later [@alpha2020] for details.';
    expect(run(SAMPLE, 'citationOrder', { doc, docText: doc })).toEqual([
      'charlie2022',
      'alpha2020',
      // uncited, addedDesc fallback over [bravo2018, delta] (append order alpha,bravo,charlie,delta)
      'delta',
      'bravo2018',
    ]);
  });

  it('citationOrder ignores prefix matches like [@alpha2020] vs @alpha', () => {
    const alpha = entry('alpha', { author: 'A', year: '2010' });
    const alpha2020 = entry('alpha2020', { author: 'B', year: '2020' });
    const doc = 'Cite [@alpha2020] only.';
    const out = sortReferences(
      [alpha, alpha2020],
      'citationOrder',
      { docText: doc, appendIndex: appendMap(['alpha', 'alpha2020']) },
    ).map((e) => e.key);
    expect(out[0]).toBe('alpha2020');
    // `alpha` is NOT matched by `[@alpha2020]`, so it falls to uncited bucket.
    expect(out[1]).toBe('alpha');
  });

  it('citationOrder requires the @key to be inside [...]; bare @key is ignored', () => {
    const doc = 'Email me @charlie2022 — but I never bracket-cite anyone.';
    const out = sortReferences(
      SAMPLE,
      'citationOrder',
      { docText: doc, appendIndex: appendMap(SAMPLE.map((e) => e.key)) },
    ).map((e) => e.key);
    // No bracketed citations: everyone falls to addedDesc.
    expect(out).toEqual(['delta', 'charlie2022', 'bravo2018', 'alpha2020']);
  });

  it('unused puts entries with zero citations first; cited entries after (addedDesc)', () => {
    const doc = 'Already covered in [@alpha2020] and [@charlie2022].';
    expect(run(SAMPLE, 'unused', { docText: doc })).toEqual([
      // uncited first, addedDesc: delta (idx 3) > bravo2018 (idx 1)
      'delta',
      'bravo2018',
      // cited block, addedDesc: charlie2022 (idx 2) > alpha2020 (idx 0)
      'charlie2022',
      'alpha2020',
    ]);
  });

  it('handles multi-cite groups like [@a; @b]', () => {
    const a = entry('a', { author: 'A' });
    const b = entry('b', { author: 'B' });
    const c = entry('c', { author: 'C' });
    const doc = 'Group cite [@a; @b]. Later [@c].';
    const out = sortReferences(
      [a, b, c],
      'citationOrder',
      { docText: doc, appendIndex: appendMap(['a', 'b', 'c']) },
    ).map((e) => e.key);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [e1, e2, e3];
    const before = input.map((e) => e.key);
    sortReferences(input, 'key', { docText: '', appendIndex: appendMap(before) });
    expect(input.map((e) => e.key)).toEqual(before);
  });
});
