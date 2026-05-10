import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { CompletionContext } from '@codemirror/autocomplete';
import { citationSource } from '../../src/editor/autocomplete/citationAutocomplete';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import type { BibEntry } from '../../shared/bibtex';

function ctx(text: string, pos: number, explicit = false): CompletionContext {
  const state = EditorState.create({ doc: text });
  return {
    state,
    pos,
    explicit,
    aborted: false,
    matchBefore: () => null,
    tokenBefore: () => null,
  } as unknown as CompletionContext;
}

const e1: BibEntry = {
  key: 'smith2024deep',
  type: 'article',
  fields: { author: 'Smith, John', title: 'Deep learning radiology', year: '2024', journal: 'Nature' },
};
const e2: BibEntry = {
  key: 'kim2023ai',
  type: 'article',
  fields: { author: 'Kim, Min-Gul', title: 'AI in medicine', year: '2023' },
};
const e3: BibEntry = {
  key: 'doe2022covid',
  type: 'article',
  fields: { author: 'Doe, Jane', title: 'COVID outcomes', year: '2022' },
};

beforeEach(() => {
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [e1, e2, e3],
    loading: false,
  });
});

describe('citationSource', () => {
  it('returns null when not inside a [@... trigger', () => {
    expect(citationSource(ctx('plain text', 5))).toBeNull();
    expect(citationSource(ctx('see [@', 0))).toBeNull();
  });

  it('returns null when no entries are loaded', () => {
    useBibliographyStore.setState({ entries: [] });
    expect(citationSource(ctx('see [@', 6))).toBeNull();
  });

  it('returns all entries when the trigger is "[@" with empty query', () => {
    const r = citationSource(ctx('see [@', 6));
    expect(r).not.toBeNull();
    expect(r!.options.length).toBe(3);
    expect(r!.from).toBe(6);
    expect(r!.to).toBe(6);
  });

  it('ranks exact-prefix key matches above substring matches', () => {
    const r = citationSource(ctx('see [@kim', 9));
    expect(r).not.toBeNull();
    expect(r!.options[0]!.label).toBe('kim2023ai');
  });

  it('filters by author surname when the query matches no key', () => {
    const r = citationSource(ctx('see [@radio', 11));
    expect(r).not.toBeNull();
    expect(r!.options.some((o) => o.label === 'smith2024deep')).toBe(true);
  });

  it('returns null on no matches (suppresses empty dropdown)', () => {
    expect(citationSource(ctx('see [@xyz', 9))).toBeNull();
  });

  it('returns an empty options list on explicit invocation with no matches', () => {
    const r = citationSource(ctx('see [@xyz', 9, true));
    expect(r).not.toBeNull();
    expect(r!.options).toEqual([]);
  });

  it('the apply payload closes the citation with a trailing bracket', () => {
    const r = citationSource(ctx('see [@kim', 9));
    expect(r).not.toBeNull();
    expect(r!.options[0]!.apply).toBe('kim2023ai]');
  });

  it('does not trigger after the closing bracket', () => {
    const r = citationSource(ctx('see [@kim] then', 15));
    expect(r).toBeNull();
  });

  it('detail contains author, year, and title', () => {
    const r = citationSource(ctx('[@', 2));
    const opt = r!.options.find((o) => o.label === 'smith2024deep')!;
    expect(opt.detail).toContain('Smith');
    expect(opt.detail).toContain('2024');
    expect(opt.detail).toContain('Deep learning radiology');
  });
});
