import { describe, it, expect } from 'vitest';
import {
  countCitationKeyReferences,
  firstAuthorLastName,
  firstSignificantTitleWord,
  makeCitationKey,
  renameCitationKeyChanges,
  romanizeHangul,
  sanitizeKey,
} from '../../shared/citationKey';
import type { BibEntry } from '../../shared/bibtex';

function entry(fields: Record<string, string>, type = 'article'): BibEntry {
  return { key: '', type, fields };
}

describe('firstAuthorLastName', () => {
  it('handles "Last, First" form', () => {
    expect(firstAuthorLastName('Smith, John')).toBe('Smith');
  });

  it('handles "First Last" form', () => {
    expect(firstAuthorLastName('John Smith')).toBe('Smith');
  });

  it('handles multi-author "and"-separated lists', () => {
    expect(firstAuthorLastName('Smith, John and Doe, Jane')).toBe('Smith');
    expect(firstAuthorLastName('John Smith and Jane Doe')).toBe('Smith');
  });

  it('returns the first syllable of a Hangul name', () => {
    expect(firstAuthorLastName('김민걸')).toBe('김');
  });

  it('returns empty for empty input', () => {
    expect(firstAuthorLastName('')).toBe('');
    expect(firstAuthorLastName('   ')).toBe('');
  });
});

describe('firstSignificantTitleWord', () => {
  it('skips common stopwords', () => {
    expect(firstSignificantTitleWord('The Lancet study on outcomes')).toBe('Lancet');
    expect(firstSignificantTitleWord('On the relevance of X')).toBe('relevance');
  });

  it('returns the very first token when nothing is a stopword', () => {
    expect(firstSignificantTitleWord('Deep learning in radiology')).toBe('Deep');
  });

  it('strips punctuation when splitting', () => {
    expect(firstSignificantTitleWord('Title: with colon — em-dash')).toBe('Title');
  });

  it('returns empty for empty input', () => {
    expect(firstSignificantTitleWord('')).toBe('');
  });
});

describe('romanizeHangul (Standard RR)', () => {
  it('romanizes 김 → gim', () => {
    expect(romanizeHangul('김')).toBe('gim');
  });

  it('romanizes 박 → bak', () => {
    expect(romanizeHangul('박')).toBe('bak');
  });

  it('romanizes 이 → i', () => {
    expect(romanizeHangul('이')).toBe('i');
  });

  it('romanizes a multi-syllable name 김민걸 → gimmingeol', () => {
    expect(romanizeHangul('김민걸')).toBe('gimmingeol');
  });

  it('romanizes 박지성 → bakjiseong', () => {
    expect(romanizeHangul('박지성')).toBe('bakjiseong');
  });

  it('passes non-hangul characters through unchanged', () => {
    expect(romanizeHangul('Smith 김')).toBe('Smith gim');
  });
});

describe('sanitizeKey', () => {
  it('lowercases and drops non-[a-z0-9]', () => {
    expect(sanitizeKey('Smith2024Deep')).toBe('smith2024deep');
    expect(sanitizeKey('Müller-Knapp')).toBe('mullerknapp');
  });

  it('romanizes hangul before stripping', () => {
    expect(sanitizeKey('김2024연구')).toBe('gim2024yeongu');
  });
});

describe('makeCitationKey', () => {
  it('builds lastnameYEARword for an English article', () => {
    const e = entry({
      author: 'Smith, John and Doe, Jane',
      title: 'Deep learning in radiology',
      year: '2024',
    });
    expect(makeCitationKey(e)).toBe('smith2024deep');
  });

  it('builds the key for a Korean author with strict RR', () => {
    const e = entry({
      author: '김민걸',
      title: 'AI in medicine',
      year: '2024',
    });
    expect(makeCitationKey(e)).toBe('gim2024ai');
  });

  it('appends a/b/c on collision', () => {
    const e = entry({
      author: 'Smith, John',
      title: 'Deep learning in radiology',
      year: '2024',
    });
    expect(makeCitationKey(e, { existingKeys: new Set(['smith2024deep']) }))
      .toBe('smith2024deepa');
    expect(
      makeCitationKey(e, { existingKeys: new Set(['smith2024deep', 'smith2024deepa']) }),
    ).toBe('smith2024deepb');
  });

  it('falls back to "entry" when the entry is missing all of author/year/title', () => {
    expect(makeCitationKey(entry({})).startsWith('entry')).toBe(true);
  });

  it('extracts the year from longer date fields', () => {
    const e = entry({
      author: 'Smith, John',
      title: 'X',
      date: '2024-03-15',
    });
    expect(makeCitationKey(e)).toBe('smith2024x');
  });

  it('skips stopwords in the title segment', () => {
    const e = entry({
      author: 'Smith, John',
      title: 'On the importance of X',
      year: '2024',
    });
    expect(makeCitationKey(e)).toBe('smith2024importance');
  });

  it('falls back to editor when author is missing', () => {
    const e = entry({
      editor: 'Doe, Jane',
      title: 'Edited volume',
      year: '2024',
    });
    expect(makeCitationKey(e)).toBe('doe2024edited');
  });

  it('accepts an array of existing keys', () => {
    const e = entry({ author: 'Smith, John', title: 'X', year: '2024' });
    const k = makeCitationKey(e, { existingKeys: ['smith2024x'] });
    expect(k).toBe('smith2024xa');
  });

  it('keeps a non-empty existing key on the entry when not collided', () => {
    const e = { ...entry({ author: 'Smith, John', title: 'X', year: '2024' }), key: 'mykey' };
    // makeCitationKey ignores entry.key by design — the cite-key generator's job
    // is to produce a fresh key. The "preserve user's key" branch lives in
    // appendEntry, not here.
    expect(makeCitationKey(e)).toBe('smith2024x');
  });
});

describe('renameCitationKeyChanges', () => {
  function applyChanges(
    doc: string,
    changes: Array<{ from: number; to: number; insert: string }>,
  ): string {
    let out = doc;
    // Apply right-to-left to keep earlier offsets stable.
    for (const c of [...changes].sort((a, b) => b.from - a.from)) {
      out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    }
    return out;
  }

  it('renames a single bare reference', () => {
    const before = 'See [@smith2024deep] for details.';
    const changes = renameCitationKeyChanges(before, 'smith2024deep', 'smith2024radiology');
    expect(applyChanges(before, changes)).toBe('See [@smith2024radiology] for details.');
  });

  it('renames the author-suppressing form [-@key]', () => {
    const before = 'per [-@smith2024] paper';
    const changes = renameCitationKeyChanges(before, 'smith2024', 'smith2024deep');
    expect(applyChanges(before, changes)).toBe('per [-@smith2024deep] paper');
  });

  it('only renames the matching key in a grouped citation', () => {
    const before = '[@a; @b; @c] all of them';
    const changes = renameCitationKeyChanges(before, 'b', 'b-renamed');
    expect(applyChanges(before, changes)).toBe('[@a; @b-renamed; @c] all of them');
  });

  it('preserves a locator suffix when renaming', () => {
    const before = '[@smith2024, p. 33]';
    const changes = renameCitationKeyChanges(before, 'smith2024', 'smith2024deep');
    expect(applyChanges(before, changes)).toBe('[@smith2024deep, p. 33]');
  });

  it('does NOT match a partial key (smith2024 inside smith2024deep)', () => {
    const before = 'see [@smith2024deep] not [@smith2024]';
    const changes = renameCitationKeyChanges(before, 'smith2024', 'renamed');
    // Only the bare smith2024 should change; smith2024deep stays.
    expect(applyChanges(before, changes)).toBe('see [@smith2024deep] not [@renamed]');
  });

  it('returns no changes when the key has no occurrences', () => {
    expect(renameCitationKeyChanges('plain text', 'foo', 'bar')).toEqual([]);
  });

  it('returns no changes when oldKey === newKey or either is empty', () => {
    expect(renameCitationKeyChanges('[@x]', 'x', 'x')).toEqual([]);
    expect(renameCitationKeyChanges('[@x]', '', 'x')).toEqual([]);
    expect(renameCitationKeyChanges('[@x]', 'x', '')).toEqual([]);
  });

  it('handles repeated references on multiple lines', () => {
    const before = 'first [@key] line\nsecond [@key] line\n';
    const changes = renameCitationKeyChanges(before, 'key', 'newkey');
    expect(changes).toHaveLength(2);
    expect(applyChanges(before, changes)).toBe(
      'first [@newkey] line\nsecond [@newkey] line\n',
    );
  });

  it('escapes regex metacharacters in the old key', () => {
    const before = 'see [@smith.2024]';
    const changes = renameCitationKeyChanges(before, 'smith.2024', 'smith2024');
    expect(applyChanges(before, changes)).toBe('see [@smith2024]');
  });
});

describe('countCitationKeyReferences', () => {
  it('counts every shape', () => {
    const doc = '[@a] and [-@a] and [@a, p. 1] and [@b; @a; @c] and [@adifferent]';
    expect(countCitationKeyReferences(doc, 'a')).toBe(4);
  });

  it('returns 0 for an absent key', () => {
    expect(countCitationKeyReferences('[@b]', 'a')).toBe(0);
  });

  it('returns 0 for an empty key without matching', () => {
    expect(countCitationKeyReferences('[@a]', '')).toBe(0);
  });
});
