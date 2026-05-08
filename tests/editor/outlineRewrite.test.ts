import { describe, it, expect } from 'vitest';
import {
  findSectionRange,
  extractSection,
  relevelSection,
  applyMove,
  hasSetextHeading,
} from '../../src/editor/outlineRewrite';
import { parseHeadings } from '../../src/editor/outline';

describe('findSectionRange', () => {
  it('returns [head, nextSibling) for a section bounded by a sibling', () => {
    const doc = '## A\nbody A\n\n## B\nbody B';
    expect(findSectionRange(doc, 1)).toEqual([1, 4]);
  });

  it('extends to end of doc when no following sibling exists', () => {
    const doc = '## A\nbody A\nstill A';
    expect(findSectionRange(doc, 1)).toEqual([1, 4]);
  });

  it('a heading captures all deeper descendants until the next sibling/ancestor', () => {
    const doc = '# H1\nbody\n\n## H2a\nbody\n\n### H3\nbody\n\n## H2b';
    // H1 covers the whole H2a subsection too.
    expect(findSectionRange(doc, 1)).toEqual([1, 11]);
    // H2a covers H3 too.
    expect(findSectionRange(doc, 4)).toEqual([4, 10]);
  });

  it('returns null for non-heading lines', () => {
    expect(findSectionRange('plain text', 1)).toBeNull();
  });

  it('ignores headings inside fenced code blocks', () => {
    const doc = '## Real\n```\n## Fake\n```\nbody\n\n## After';
    expect(findSectionRange(doc, 1)).toEqual([1, 7]);
  });
});

describe('extractSection', () => {
  it('separates section text from the remainder of the doc', () => {
    const doc = '## A\nbody A\n\n## B\nbody B';
    const out = extractSection(doc, [1, 4]);
    expect(out.section).toBe('## A\nbody A\n');
    expect(out.remainder).toBe('## B\nbody B');
  });
});

describe('relevelSection', () => {
  it('promotes every heading by the given delta', () => {
    const section = '### Top\nbody\n\n#### Sub';
    expect(relevelSection(section, -1)).toBe('## Top\nbody\n\n### Sub');
  });

  it('demotes every heading by the given delta', () => {
    const section = '## Top\n\n### Sub';
    expect(relevelSection(section, 1)).toBe('### Top\n\n#### Sub');
  });

  it('returns null when any heading would exceed H6', () => {
    expect(relevelSection('##### Top\n###### Sub', 2)).toBeNull();
  });

  it('returns null when the first line is not an ATX heading', () => {
    expect(relevelSection('plain\n# nope', 1)).toBeNull();
  });

  it('does not touch lines inside fenced code blocks', () => {
    const section = '## Top\n```\n## not a heading\n```';
    expect(relevelSection(section, 1)).toBe('### Top\n```\n## not a heading\n```');
  });

  it('is a no-op when delta is 0', () => {
    expect(relevelSection('## Top', 0)).toBe('## Top');
  });
});

describe('applyMove (sibling reorder)', () => {
  it('moves a sibling H2 down to after another sibling', () => {
    const doc = '## A\nbody A\n\n## B\nbody B\n\n## C\nbody C';
    // Move A to AFTER B.
    const out = applyMove(doc, 1, 4, 'after');
    expect(out).not.toBeNull();
    const headings = parseHeadings(out!);
    expect(headings.map((h) => h.text)).toEqual(['B', 'A', 'C']);
  });

  it('moves a sibling H2 up to BEFORE the first sibling', () => {
    const doc = '## A\nbody A\n\n## B\nbody B\n\n## C\nbody C';
    const out = applyMove(doc, 7, 1, 'before');
    expect(out).not.toBeNull();
    const headings = parseHeadings(out!);
    expect(headings.map((h) => h.text)).toEqual(['C', 'A', 'B']);
  });

  it('keeps body content attached to its heading', () => {
    const doc = '## A\nA1\nA2\n\n## B\nB1';
    const out = applyMove(doc, 1, 5, 'after');
    expect(out).not.toBeNull();
    expect(out).toContain('## A\nA1\nA2');
  });
});

describe('applyMove (reparenting)', () => {
  it('keeps level when moving an H3 from one H2 to another H2', () => {
    const doc =
      '## P1\n\n### Child\nchild body\n\n## P2\n\n### Existing\nexisting body';
    // Move "Child" (line 3) to AFTER "Existing" (line 8).
    const out = applyMove(doc, 3, 8, 'after');
    expect(out).not.toBeNull();
    const headings = parseHeadings(out!);
    // Both children should still be H3 under H2 P2.
    expect(headings.map((h) => `${h.level}:${h.text}`)).toEqual([
      '2:P1',
      '2:P2',
      '3:Existing',
      '3:Child',
    ]);
  });

  it('promotes an H3 to H2 when dropped as a sibling of an H1', () => {
    // "Move H3 from inside H2 #1 to be a top-level sibling of H1."
    const doc = '# Top\n\n## H2\n\n### Deep\ndeep body\n\n# Other';
    // Drop "Deep" (line 5) AFTER "Top" (line 1) so it becomes an H2.
    const out = applyMove(doc, 5, 1, 'inside');
    expect(out).not.toBeNull();
    const headings = parseHeadings(out!);
    // "Deep" should now be H2.
    const deep = headings.find((h) => h.text === 'Deep');
    expect(deep?.level).toBe(2);
  });

  it('refuses to move a section if any nested heading would exceed H6', () => {
    const doc = '## Outer\n\n###### Deepest\n\n## Other';
    // Trying to drop "Outer" inside "Other" would push "Deepest" past H6.
    // First demote: outer becomes ###, deepest becomes #######  -> refused.
    const out = applyMove(doc, 1, 5, 'inside');
    expect(out).toBeNull();
  });

  it('refuses no-op moves onto itself', () => {
    const doc = '## A\n\n## B';
    expect(applyMove(doc, 1, 1, 'before')).toBeNull();
  });

  it('refuses to drop a section onto a heading inside its own range', () => {
    const doc = '## Parent\n\n### Child\nbody\n\n## Other';
    // Parent contains Child; can't drop Parent onto Child.
    expect(applyMove(doc, 1, 3, 'before')).toBeNull();
  });
});

describe('applyMove (front matter is sticky)', () => {
  it('does not disturb the front matter when reordering siblings', () => {
    const doc =
      '---\ntitle: Hello\nauthor: Jane\n---\n\n## A\nbody A\n\n## B\nbody B';
    const out = applyMove(doc, 6, 9, 'after');
    expect(out).not.toBeNull();
    expect(out!.startsWith('---\ntitle: Hello\nauthor: Jane\n---')).toBe(true);
    const headings = parseHeadings(out!);
    expect(headings.map((h) => h.text)).toEqual(['B', 'A']);
  });
});

describe('round-trip outline tree', () => {
  it('after a move, parseHeadings + buildOutlineTree produces the expected order', () => {
    const doc =
      '# Doc\n\n## Section 1\nintro\n\n### Sub 1.1\nsub1\n\n## Section 2\nbody\n\n### Sub 2.1\nsub2';
    // Move "Section 2" (line 9) to BEFORE "Section 1" (line 3).
    const out = applyMove(doc, 9, 3, 'before');
    expect(out).not.toBeNull();
    const tree = parseHeadings(out!);
    expect(tree.map((h) => `${h.level}:${h.text}`)).toEqual([
      '1:Doc',
      '2:Section 2',
      '3:Sub 2.1',
      '2:Section 1',
      '3:Sub 1.1',
    ]);
  });
});

describe('hasSetextHeading', () => {
  it('detects setext H1 (===)', () => {
    expect(hasSetextHeading('Title\n=====\n\nbody')).toBe(true);
  });

  it('detects setext H2 (---) under non-empty line', () => {
    expect(hasSetextHeading('Title\n-----\n\nbody')).toBe(true);
  });

  it('returns false for ATX-only docs', () => {
    expect(hasSetextHeading('# Title\nbody\n\n## Sub')).toBe(false);
  });

  it('does not flag horizontal rule after blank line as setext', () => {
    expect(hasSetextHeading('para\n\n---\n\nmore')).toBe(false);
  });

  it('ignores `---` inside fenced code', () => {
    expect(hasSetextHeading('# H\n\n```\ntext\n---\n```')).toBe(false);
  });
});
