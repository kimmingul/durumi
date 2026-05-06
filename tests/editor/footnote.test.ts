import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { FootnoteExtension } from '../../src/editor/markdownExt/footnote';
import {
  footnoteDecoration,
  footnoteTheme,
} from '../../src/editor/decorations/footnote';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, FootnoteExtension],
      }),
      footnoteDecoration(),
      footnoteTheme,
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

describe('FootnoteExtension', () => {
  it('parses an inline reference [^id]', () => {
    const doc = 'see[^a] for details';
    const view = setup(doc, 0);
    const refs = nodesOfType(view, 'FootnoteRef');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ from: 3, to: 7 });
    view.destroy();
  });

  it('does not match `[^]` (empty label) or `[no caret]`', () => {
    expect(nodesOfType(setup('see [^] x'), 'FootnoteRef')).toHaveLength(0);
    expect(nodesOfType(setup('a [link] b'), 'FootnoteRef')).toHaveLength(0);
  });

  it('parses a footnote definition spanning multiple lines until a blank line', () => {
    const doc = '[^a]: First line\n  continuation\n\nbody';
    const view = setup(doc, doc.length);
    const defs = nodesOfType(view, 'FootnoteDef');
    expect(defs).toHaveLength(1);
    // ends at end of the second line (before the blank line)
    expect(defs[0]?.from).toBe(0);
    expect(defs[0]?.to).toBe(doc.indexOf('\n\n'));
    view.destroy();
  });

  it('treats a new [^id]: line as the start of a separate definition', () => {
    const doc = '[^a]: one\n[^b]: two\n';
    const view = setup(doc, doc.length);
    const defs = nodesOfType(view, 'FootnoteDef');
    expect(defs).toHaveLength(2);
    view.destroy();
  });
});

describe('footnoteDecoration', () => {
  it('renders a superscript widget for a reference when caret is elsewhere', () => {
    const view = setup('see[^a] body', 10);
    const sup = view.dom.querySelector('.cm-md-footnote-ref');
    expect(sup).not.toBeNull();
    expect(sup?.textContent).toBe('a');
    view.destroy();
  });

  it('shows the raw reference text when caret is on it', () => {
    const view = setup('see[^a] body', 5); // caret inside [^a]
    expect(view.dom.querySelector('.cm-md-footnote-ref')).toBeNull();
    expect(view.dom.textContent).toContain('[^a]');
    view.destroy();
  });

  it('decorates a definition line with the marker widget when caret is elsewhere', () => {
    const view = setup('[^a]: text\n\nbody', 14);
    const marker = view.dom.querySelector('.cm-md-footnote-def-marker');
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe('[a]');
    view.destroy();
  });
});
