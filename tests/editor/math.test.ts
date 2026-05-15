import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { scanInlineMath, scanBlockMath } from '../../src/editor/math/scan';
import { mathDecorations } from '../../src/editor/decorations/math';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

function mk(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
}

function setupMathView(doc: string, cursor: number, mode: EditMode): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      editModeStateExtension(),
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      mathDecorations,
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
  return view;
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

describe('blockMathField — mode-only rebuild', () => {
  // ── Mode-only transaction regression guard — v0.2.8 codex follow-up #2 ──
  // The blockMathField listened for `renderTick` but not `setEditMode`. With
  // the caret inside a `$$ … $$` block, Live mode shows raw source; on a bare
  // `setEditMode.of('wysiwyg')` (no doc change, no selection change) the
  // field must rebuild and collapse the block to the rendered widget.
  it('rebuilds block-math decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = '$$x + y = z$$';
    // Caret inside the block, Live (typora) mode -> block stays as raw text
    // (no `Decoration.replace`).
    const view = setupMathView(doc, 5, 'typora');
    // Baseline: no block widget while caret is inside in Live mode.
    expect(view.dom.querySelector('.cm-math-block')).toBeNull();
    // Mode-only transaction: no `changes`, no `selection`.
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    // After the effect, Document mode must have collapsed the block to a widget.
    expect(view.dom.querySelector('.cm-math-block')).not.toBeNull();
    view.destroy();
  });
});
