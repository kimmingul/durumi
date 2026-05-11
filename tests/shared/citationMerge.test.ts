import { describe, expect, it } from 'vitest';
import { insertCitationSmart } from '../../shared/citationMerge';

/**
 * The helper has three branches:
 *   1. Plain insertion when the caret is nowhere near a `[@…]` group.
 *   2. Merge when the caret is inside / adjacent to one.
 *   3. Duplicate-rejection when the key is already in that group.
 *
 * We hit each via small synthetic docs. `pos` is given as the offset where
 * the user "pressed Enter" from CitePalette or pasted into the dialog.
 */

function caretSlice(doc: string, marker = '|'): { doc: string; pos: number } {
  const pos = doc.indexOf(marker);
  if (pos < 0) throw new Error(`marker ${marker} missing`);
  return { doc: doc.slice(0, pos) + doc.slice(pos + marker.length), pos };
}

describe('insertCitationSmart — plain insertion', () => {
  it('inserts [@key] at the caret when no group is nearby', () => {
    const { doc, pos } = caretSlice('hello world|');
    const r = insertCitationSmart(doc, pos, 'smith2024');
    expect(r.kind).toBe('replace');
    if (r.kind !== 'replace') throw new Error();
    expect(r.from).toBe(pos);
    expect(r.to).toBe(pos);
    expect(r.insert).toBe('[@smith2024]');
    expect(r.caret).toBe(pos + '[@smith2024]'.length);
  });

  it('accepts a key that includes a leading `@`', () => {
    const { doc, pos } = caretSlice('a b|');
    const r = insertCitationSmart(doc, pos, '@kim2025');
    if (r.kind !== 'replace') throw new Error();
    expect(r.insert).toBe('[@kim2025]');
  });

  it('returns an empty edit for an empty key', () => {
    const r = insertCitationSmart('hello', 5, '');
    if (r.kind !== 'replace') throw new Error();
    expect(r.insert).toBe('');
  });
});

describe('insertCitationSmart — merge into adjacent group', () => {
  it('merges when the caret is inside a single-key group', () => {
    const { doc, pos } = caretSlice('say [@a|] more');
    const r = insertCitationSmart(doc, pos, 'b');
    if (r.kind !== 'replace') throw new Error();
    const next = doc.slice(0, r.from) + r.insert + doc.slice(r.to);
    expect(next).toBe('say [@a; @b] more');
    // Caret should land just before the `]`.
    expect(next[r.caret]).toBe(']');
  });

  it('merges when the caret is right after `]`', () => {
    const { doc, pos } = caretSlice('say [@a]| more');
    const r = insertCitationSmart(doc, pos, 'b');
    if (r.kind !== 'replace') throw new Error();
    const next = doc.slice(0, r.from) + r.insert + doc.slice(r.to);
    expect(next).toBe('say [@a; @b] more');
  });

  it('merges when the caret is right before `[`', () => {
    const { doc, pos } = caretSlice('say |[@a] more');
    const r = insertCitationSmart(doc, pos, 'b');
    if (r.kind !== 'replace') throw new Error();
    const next = doc.slice(0, r.from) + r.insert + doc.slice(r.to);
    expect(next).toBe('say [@a; @b] more');
  });

  it('merges into a multi-key group', () => {
    const { doc, pos } = caretSlice('see [@a; @b]| more');
    const r = insertCitationSmart(doc, pos, 'c');
    if (r.kind !== 'replace') throw new Error();
    const next = doc.slice(0, r.from) + r.insert + doc.slice(r.to);
    expect(next).toBe('see [@a; @b; @c] more');
  });

  it('preserves a locator at the end of the group', () => {
    const { doc, pos } = caretSlice('cf. [@a, p. 33]|');
    const r = insertCitationSmart(doc, pos, 'b');
    if (r.kind !== 'replace') throw new Error();
    const next = doc.slice(0, r.from) + r.insert + doc.slice(r.to);
    expect(next).toBe('cf. [@a; @b, p. 33]');
  });
});

describe('insertCitationSmart — duplicate rejection', () => {
  it('rejects when the key is already in the adjacent group', () => {
    const { doc, pos } = caretSlice('text [@a]| trail');
    const r = insertCitationSmart(doc, pos, 'a');
    expect(r.kind).toBe('duplicate');
    if (r.kind !== 'duplicate') throw new Error();
    expect(doc.slice(r.existingGroupRange[0], r.existingGroupRange[1])).toBe('[@a]');
  });

  it('rejects when the key is already in a multi-key group', () => {
    const { doc, pos } = caretSlice('see [@a; @b; @c]|');
    const r = insertCitationSmart(doc, pos, 'b');
    expect(r.kind).toBe('duplicate');
  });

  it('still inserts when caret is far from any group', () => {
    const { doc, pos } = caretSlice('intro |body [@a] tail');
    const r = insertCitationSmart(doc, pos, 'a');
    expect(r.kind).toBe('replace');
    if (r.kind !== 'replace') throw new Error();
    expect(r.insert).toBe('[@a]');
  });
});

describe('insertCitationSmart — non-cite brackets', () => {
  it('does not merge into a link `[text](url)`', () => {
    const { doc, pos } = caretSlice('see [foo](bar)| now');
    const r = insertCitationSmart(doc, pos, 'a');
    if (r.kind !== 'replace') throw new Error();
    // Plain insertion at caret.
    expect(r.from).toBe(pos);
    expect(r.insert).toBe('[@a]');
  });

  it('does not merge into a footnote ref `[^1]`', () => {
    const { doc, pos } = caretSlice('text[^1]| more');
    const r = insertCitationSmart(doc, pos, 'a');
    if (r.kind !== 'replace') throw new Error();
    expect(r.insert).toBe('[@a]');
  });
});
