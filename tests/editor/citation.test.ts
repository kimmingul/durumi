import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { CitationExtension } from '../../src/editor/markdownExt/citation';
import { FootnoteExtension } from '../../src/editor/markdownExt/footnote';
import {
  citationDecoration,
  citationTheme,
} from '../../src/editor/decorations/citation';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, FootnoteExtension, CitationExtension],
      }),
      citationDecoration(),
      citationTheme,
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  // Simulate user interaction so the userActiveField flips to true and the
  // active-line-based decorations behave as in a real session.
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

function nodesOfType(view: EditorView, name: string) {
  const out: Array<{ from: number; to: number; text: string }> = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === name) {
        out.push({
          from: node.from,
          to: node.to,
          text: view.state.doc.sliceString(node.from, node.to),
        });
      }
    },
  });
  return out;
}

describe('CitationExtension', () => {
  it('parses [@key] as a Citation node with a CitationKey child', () => {
    const view = setup('See [@smith2023].', 0);
    expect(nodesOfType(view, 'Citation')).toHaveLength(1);
    const keys = nodesOfType(view, 'CitationKey').map((n) => n.text);
    expect(keys).toEqual(['smith2023']);
    view.destroy();
  });

  it('parses grouped [@a; @b]', () => {
    const view = setup('Refer [@a; @b].');
    const keys = nodesOfType(view, 'CitationKey').map((n) => n.text);
    expect(keys).toEqual(['a', 'b']);
    view.destroy();
  });

  it('parses [-@key] author-suppressing form', () => {
    const view = setup('As shown [-@smith2023].');
    expect(nodesOfType(view, 'CitationKey').map((n) => n.text)).toEqual(['smith2023']);
    view.destroy();
  });

  it('does not interfere with footnote refs [^a]', () => {
    const view = setup('See[^a] body');
    expect(nodesOfType(view, 'Citation')).toHaveLength(0);
    expect(nodesOfType(view, 'FootnoteRef')).toHaveLength(1);
    view.destroy();
  });

  it('does not match a plain link [text](url)', () => {
    const view = setup('a [text](http://x) b');
    expect(nodesOfType(view, 'Citation')).toHaveLength(0);
    view.destroy();
  });
});

describe('citationDecoration', () => {
  it('replaces a citation outside the caret line with a [n] superscript', () => {
    const doc = 'See [@a] and [@b].';
    const view = setup(doc, doc.length);
    const sups = view.dom.querySelectorAll('.cm-md-citation');
    expect(sups.length).toBe(2);
    expect(sups[0]?.textContent).toBe('[1]');
    expect(sups[1]?.textContent).toBe('[2]');
    view.destroy();
  });

  it('groups consecutive keys with commas in the widget text', () => {
    const view = setup('Refer [@a; @b; @c] please.', 0);
    const sup = view.dom.querySelector('.cm-md-citation');
    expect(sup?.textContent).toBe('[1,2,3]');
    view.destroy();
  });

  it('reuses numbers for repeated keys', () => {
    const doc = 'First [@a]. Second [@a].';
    const view = setup(doc, doc.length);
    const sups = view.dom.querySelectorAll('.cm-md-citation');
    expect(sups[0]?.textContent).toBe('[1]');
    expect(sups[1]?.textContent).toBe('[1]');
    view.destroy();
  });

  it('shows the raw [@key] when the caret is on it', () => {
    const view = setup('See [@a] body.', 6);
    expect(view.dom.querySelector('.cm-md-citation')).toBeNull();
    expect(view.dom.textContent).toContain('[@a]');
    view.destroy();
  });
});
