import { describe, it, expect } from 'vitest';
import { findCitationSpan } from '../../src/editor/decorations/citationHover';

describe('findCitationSpan', () => {
  it('returns null when no citation surrounds the column', () => {
    expect(findCitationSpan('plain text without citations', 5)).toBeNull();
  });

  it('finds a single-key citation block', () => {
    const r = findCitationSpan('see [@smith2024]', 8);
    expect(r).not.toBeNull();
    expect(r!.start).toBe(4);
    expect(r!.end).toBe(16);
    expect(r!.keys).toEqual(['smith2024']);
  });

  it('captures all keys in a grouped citation', () => {
    const r = findCitationSpan('per [@a; @b; @c] elsewhere', 10);
    expect(r).not.toBeNull();
    expect(r!.keys).toEqual(['a', 'b', 'c']);
  });

  it('handles author-suppressing form [-@key]', () => {
    const r = findCitationSpan('per [-@key] paper', 7);
    expect(r).not.toBeNull();
    expect(r!.keys).toEqual(['key']);
  });

  it('returns null when col is outside the bracket span', () => {
    const r = findCitationSpan('see [@smith] there', 14);
    expect(r).toBeNull();
  });

  it('finds the right span when multiple citations share a line', () => {
    const r = findCitationSpan('a [@one] b [@two] c', 14);
    expect(r).not.toBeNull();
    expect(r!.keys).toEqual(['two']);
  });

  it('matches at the boundary inclusive on both ends', () => {
    const text = 'pre [@x] post';
    expect(findCitationSpan(text, 4)).not.toBeNull(); // at '['
    expect(findCitationSpan(text, 8)).not.toBeNull(); // at ']'
    expect(findCitationSpan(text, 9)).toBeNull(); // past ']'
  });

  it('preserves locator-bearing keys via the existing parser', () => {
    const r = findCitationSpan('see [@smith2024, p. 33]', 12);
    expect(r).not.toBeNull();
    expect(r!.keys).toEqual(['smith2024']);
  });
});
