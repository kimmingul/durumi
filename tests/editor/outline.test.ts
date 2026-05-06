import { describe, it, expect } from 'vitest';
import { parseHeadings, buildOutlineTree } from '../../src/editor/outline';

describe('parseHeadings', () => {
  it('extracts ATX headings with line numbers (1-based)', () => {
    const doc = '# Title\n\n## Sub\n\ntext\n\n### Deep';
    expect(parseHeadings(doc)).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Sub', line: 3 },
      { level: 3, text: 'Deep', line: 7 },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const doc = '# Real\n\n```\n# Fake\n## Fake2\n```\n\n## After';
    expect(parseHeadings(doc)).toEqual([
      { level: 1, text: 'Real', line: 1 },
      { level: 2, text: 'After', line: 8 },
    ]);
  });

  it('handles tilde-fence code blocks', () => {
    const doc = '~~~\n# Fake\n~~~\n\n## After';
    expect(parseHeadings(doc)).toEqual([
      { level: 2, text: 'After', line: 5 },
    ]);
  });

  it('returns an empty array for a doc without headings', () => {
    expect(parseHeadings('plain text\nmore text')).toEqual([]);
  });

  it('returns an empty array for an empty doc', () => {
    expect(parseHeadings('')).toEqual([]);
  });

  it('skips lines that look like headings without trailing space', () => {
    const doc = '#NoSpace\n# WithSpace';
    expect(parseHeadings(doc)).toEqual([{ level: 1, text: 'WithSpace', line: 2 }]);
  });

  it('caps at H6 — H7 is not a heading', () => {
    const doc = '####### too deep\n###### six';
    expect(parseHeadings(doc)).toEqual([{ level: 6, text: 'six', line: 2 }]);
  });

  it('trims trailing whitespace from heading text', () => {
    const doc = '## Title   ';
    expect(parseHeadings(doc)).toEqual([{ level: 2, text: 'Title', line: 1 }]);
  });

  it('handles Korean heading text', () => {
    const doc = '## 한국어 제목';
    expect(parseHeadings(doc)).toEqual([{ level: 2, text: '한국어 제목', line: 1 }]);
  });
});

describe('buildOutlineTree', () => {
  it('returns empty forest for empty input', () => {
    expect(buildOutlineTree([])).toEqual([]);
  });

  it('nests H2 under H1', () => {
    const tree = buildOutlineTree([
      { level: 1, text: 'A', line: 1 },
      { level: 2, text: 'A.1', line: 2 },
    ]);
    expect(tree).toEqual([
      {
        level: 1,
        text: 'A',
        line: 1,
        children: [{ level: 2, text: 'A.1', line: 2, children: [] }],
      },
    ]);
  });

  it('handles sibling headings at the same level', () => {
    const tree = buildOutlineTree([
      { level: 2, text: 'A', line: 1 },
      { level: 2, text: 'B', line: 2 },
    ]);
    expect(tree.length).toBe(2);
    expect(tree[0].text).toBe('A');
    expect(tree[1].text).toBe('B');
  });

  it('handles a level jump (H1 to H3)', () => {
    const tree = buildOutlineTree([
      { level: 1, text: 'A', line: 1 },
      { level: 3, text: 'A.x.x', line: 2 },
    ]);
    expect(tree).toEqual([
      {
        level: 1,
        text: 'A',
        line: 1,
        children: [{ level: 3, text: 'A.x.x', line: 2, children: [] }],
      },
    ]);
  });

  it('pops back up correctly: H1, H2, H2', () => {
    const tree = buildOutlineTree([
      { level: 1, text: 'A', line: 1 },
      { level: 2, text: 'A.1', line: 2 },
      { level: 2, text: 'A.2', line: 3 },
    ]);
    expect(tree).toEqual([
      {
        level: 1,
        text: 'A',
        line: 1,
        children: [
          { level: 2, text: 'A.1', line: 2, children: [] },
          { level: 2, text: 'A.2', line: 3, children: [] },
        ],
      },
    ]);
  });
});
