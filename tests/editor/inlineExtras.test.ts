import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';

function setup(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, InlineExtrasExtension],
      }),
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

function nodesOfType(view: EditorView, name: string) {
  const out: Array<{ from: number; to: number }> = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === name) out.push({ from: node.from, to: node.to });
    },
  });
  return out;
}

describe('InlineExtrasExtension', () => {
  it('parses ==text== as Highlight', () => {
    const view = setup('hello ==world== bye');
    const hl = nodesOfType(view, 'Highlight');
    expect(hl).toHaveLength(1);
    expect(hl[0]).toEqual({ from: 6, to: 15 });
    view.destroy();
  });

  it('parses single ~text~ as Subscript without consuming ~~strikethrough~~', () => {
    const view = setup('H~2~O and ~~gone~~');
    expect(nodesOfType(view, 'Subscript').length).toBe(1);
    expect(nodesOfType(view, 'Strikethrough').length).toBe(1);
    view.destroy();
  });

  it('parses ^X^ as Superscript', () => {
    const view = setup('Na^+^ ion');
    const sup = nodesOfType(view, 'Superscript');
    expect(sup).toHaveLength(1);
    expect(sup[0]).toEqual({ from: 2, to: 5 });
    view.destroy();
  });

  it('does not match across whitespace', () => {
    expect(nodesOfType(setup('= a ='), 'Highlight').length).toBe(0);
    expect(nodesOfType(setup('~ no ~'), 'Subscript').length).toBe(0);
    expect(nodesOfType(setup('^ x ^'), 'Superscript').length).toBe(0);
  });
});
