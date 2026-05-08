import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { TocExtension } from '../../src/editor/markdownExt/toc';
import { tocDecoration, tocTheme } from '../../src/editor/decorations/toc';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, TocExtension],
      }),
      tocDecoration(),
      tocTheme,
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
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

describe('TocExtension parser', () => {
  it('matches a standalone [toc] line (case-insensitive)', () => {
    expect(nodesOfType(setup('[toc]\n\n# H'), 'TocDirective')).toHaveLength(1);
    expect(nodesOfType(setup('[TOC]\n# H'), 'TocDirective')).toHaveLength(1);
  });
  it('does not match [toc] in the middle of a line', () => {
    expect(nodesOfType(setup('see [toc] here'), 'TocDirective')).toHaveLength(0);
  });
  it('does not match anything else that vaguely looks like it', () => {
    expect(nodesOfType(setup('[t]'), 'TocDirective')).toHaveLength(0);
    expect(nodesOfType(setup('[ toc ]'), 'TocDirective')).toHaveLength(0);
  });
});

describe('tocDecoration', () => {
  it('renders a TOC widget listing the document headings', () => {
    const doc = '[toc]\n\n# Intro\n\n## Methods\n';
    const view = setup(doc, doc.length);
    const widget = view.dom.querySelector('.cm-md-toc');
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toContain('Intro');
    expect(widget?.textContent).toContain('Methods');
    view.destroy();
  });

  it('shows the empty placeholder when there are no headings yet', () => {
    const doc = '[toc]\n\nbody';
    const view = setup(doc, doc.length);
    const widget = view.dom.querySelector('.cm-md-toc');
    expect(widget?.textContent).toContain('add some headings');
    view.destroy();
  });

  it('keeps the source visible when caret is on the directive line', () => {
    const view = setup('[toc]\n\n# A\n', 2); // caret inside [toc]
    expect(view.dom.querySelector('.cm-md-toc')).toBeNull();
    expect(view.dom.textContent).toContain('[toc]');
    view.destroy();
  });
});
