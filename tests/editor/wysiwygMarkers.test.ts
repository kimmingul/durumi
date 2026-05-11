import { describe, expect, it } from 'vitest';
import { findMarkerRanges } from '../../src/editor/decorations/wysiwygMarkers';

describe('findMarkerRanges', () => {
  it('returns empty for plain text', () => {
    expect(findMarkerRanges('Plain paragraph with no markers.', 0)).toEqual([]);
  });

  it('detects ATX heading leader', () => {
    expect(findMarkerRanges('## Heading two', 0)).toEqual([[0, 3]]);
    expect(findMarkerRanges('###### Six', 100)).toEqual([[100, 107]]);
  });

  it('detects blockquote prefix', () => {
    expect(findMarkerRanges('> quoted', 0)).toEqual([[0, 2]]);
    expect(findMarkerRanges('>> nested', 0)).toEqual([[0, 3]]);
  });

  it('detects bullet and ordered list markers', () => {
    expect(findMarkerRanges('- item', 0)).toEqual([[0, 2]]);
    expect(findMarkerRanges('* item', 0)).toEqual([[0, 2]]);
    expect(findMarkerRanges('+ item', 0)).toEqual([[0, 2]]);
    expect(findMarkerRanges('1. item', 0)).toEqual([[0, 3]]);
    expect(findMarkerRanges('  - nested', 50)).toEqual([[52, 54]]);
  });

  it('detects inline emphasis and strike markers', () => {
    // **bold** → markers at [0,2) and [6,8)
    expect(findMarkerRanges('**bold**', 0)).toEqual([
      [0, 2],
      [6, 8],
    ]);
    // _italic_ → [0,1) and [7,8)
    expect(findMarkerRanges('_italic_', 0)).toEqual([
      [0, 1],
      [7, 8],
    ]);
    // ~~strike~~
    expect(findMarkerRanges('~~strike~~', 0)).toEqual([
      [0, 2],
      [8, 10],
    ]);
  });

  it('detects backtick code spans', () => {
    expect(findMarkerRanges('`code`', 0)).toEqual([
      [0, 1],
      [5, 6],
    ]);
  });

  it('merges overlapping ranges from heading + emphasis', () => {
    // '# **Bold heading**' → heading [0,2), bold markers [2,4) and [15,17)
    // The heading [0,2) and the first '**' at [2,4) are non-overlapping but
    // adjacent. We expect them merged into [0,4).
    expect(findMarkerRanges('# **Bold heading**', 0)).toEqual([
      [0, 4],
      [16, 18],
    ]);
  });

  it('applies lineFrom offset uniformly', () => {
    // '## Hello' starting at document position 100 — heading marker is at
    // [100, 103).
    expect(findMarkerRanges('## Hello', 100)).toEqual([[100, 103]]);
  });

  it('handles list marker with multi-digit ordered prefix', () => {
    expect(findMarkerRanges('12. item', 0)).toEqual([[0, 4]]);
  });

  it('does not collapse adjacent emphasis pairs of different lengths', () => {
    // `**a*` is unusual but the scanner should still return both markers.
    const ranges = findMarkerRanges('**a*', 0);
    expect(ranges).toContainEqual([0, 2]);
    expect(ranges).toContainEqual([3, 4]);
  });
});
