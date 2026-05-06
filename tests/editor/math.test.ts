import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { scanInlineMath, scanBlockMath } from '../../src/editor/math/scan';

function mk(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
}

describe('math scanner', () => {
  it('finds inline math', () => {
    const s = mk('text $x^2$ more');
    const blocks = scanBlockMath(s);
    const inlines = scanInlineMath(s, blocks);
    expect(inlines).toHaveLength(1);
    expect(inlines[0]!.tex).toBe('x^2');
  });

  it('finds inline math with single character body', () => {
    const s = mk('text $x$ more');
    const blocks = scanBlockMath(s);
    const inlines = scanInlineMath(s, blocks);
    expect(inlines).toHaveLength(1);
    expect(inlines[0]!.tex).toBe('x');
  });

  it('skips inline math inside fenced code', () => {
    const s = mk('text\n```\n$x^2$\n```\n');
    const blocks = scanBlockMath(s);
    expect(scanInlineMath(s, blocks)).toHaveLength(0);
  });

  it('skips inline math inside inline code', () => {
    const s = mk('text `$x^2$` more');
    const blocks = scanBlockMath(s);
    expect(scanInlineMath(s, blocks)).toHaveLength(0);
  });

  it('finds block math across newlines', () => {
    const s = mk('text\n$$a + b\n= c$$\nmore');
    expect(scanBlockMath(s)).toHaveLength(1);
  });

  it('rejects $5 / $10 (whitespace adjacency)', () => {
    const s = mk('I have $5 and $10');
    const blocks = scanBlockMath(s);
    expect(scanInlineMath(s, blocks)).toHaveLength(0);
  });

  it('block math suppresses inline math inside it', () => {
    const s = mk('$$x + y = z$$');
    expect(scanBlockMath(s)).toHaveLength(1);
    expect(scanInlineMath(s, scanBlockMath(s))).toHaveLength(0);
  });

  it('rejects escaped \\$ delimiters', () => {
    const s = mk('text \\$x^2\\$ more');
    const blocks = scanBlockMath(s);
    expect(scanInlineMath(s, blocks)).toHaveLength(0);
  });

  it('handles Korean text mixed with math', () => {
    const s = mk('한국어 $x^2$ 문자');
    const blocks = scanBlockMath(s);
    const inlines = scanInlineMath(s, blocks);
    expect(inlines).toHaveLength(1);
    expect(inlines[0]!.tex).toBe('x^2');
  });
});
