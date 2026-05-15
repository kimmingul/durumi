import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';
import { CriticMarkupExtension } from '../../src/editor/markdownExt/criticMarkup';
import { highlightExtras } from '../../src/editor/decorations/highlight';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

function setup(doc: string, cursor: number, mode: EditMode = 'typora'): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        editModeStateExtension(),
        markdown({
          base: markdownLanguage,
          extensions: [GFM, InlineExtrasExtension, CriticMarkupExtension],
        }),
        highlightExtras(),
      ],
    }),
    parent,
  });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
  return view;
}

function nodeNames(view: EditorView): string[] {
  const names: string[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

describe('highlightExtras — Highlight (==text==)', () => {
  it('hides `==` markers and applies cm-md-html-mark off the active line (Live mode)', () => {
    const doc = '==hi== other\nnext';
    const v = setup(doc, doc.length); // caret on line 2
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    expect(v.dom.querySelector('.cm-md-html-mark')).toBeTruthy();
    v.destroy();
  });

  it('hides `==` markers ON the active line in Document (wysiwyg) mode', () => {
    const doc = '==hi==';
    const v = setup(doc, 2, 'wysiwyg'); // caret inside the highlight
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    expect(v.dom.querySelector('.cm-md-html-mark')).toBeTruthy();
    v.destroy();
  });

  it('shows raw `==` markers on the active line in Live (typora) mode', () => {
    const doc = '==hi==';
    const v = setup(doc, 2, 'typora');
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBe(0);
    expect(v.dom.textContent ?? '').toContain('==');
    v.destroy();
  });
});

describe('highlightExtras — Subscript (~text~)', () => {
  it('hides `~` markers and applies cm-md-html-sub off the active line (Live mode)', () => {
    const doc = 'H~2~O later\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    expect(v.dom.querySelector('.cm-md-html-sub')).toBeTruthy();
    v.destroy();
  });

  it('hides `~` markers on the active line in Document mode', () => {
    const doc = 'H~2~O';
    const v = setup(doc, 2, 'wysiwyg');
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    v.destroy();
  });

  it('shows raw `~` on the active line in Live mode', () => {
    const doc = 'H~2~O';
    const v = setup(doc, 2, 'typora');
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBe(0);
    expect(v.dom.textContent ?? '').toContain('~');
    v.destroy();
  });
});

describe('highlightExtras — Superscript (^text^)', () => {
  it('hides `^` markers and applies cm-md-html-sup off the active line', () => {
    const doc = 'X^2^ later\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    expect(v.dom.querySelector('.cm-md-html-sup')).toBeTruthy();
    v.destroy();
  });

  it('hides `^` markers on the active line in Document mode', () => {
    const doc = 'X^2^';
    const v = setup(doc, 2, 'wysiwyg');
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    v.destroy();
  });

  it('shows raw `^` on the active line in Live mode', () => {
    const doc = 'X^2^';
    const v = setup(doc, 2, 'typora');
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBe(0);
    expect(v.dom.textContent ?? '').toContain('^');
    v.destroy();
  });
});

describe('highlightExtras — grammar disambiguation', () => {
  it('does not parse `~~strike~~` as Subscript (lezer GFM strikethrough wins)', () => {
    const doc = '~~strike~~';
    const v = setup(doc, doc.length);
    const names = nodeNames(v);
    expect(names).not.toContain('Subscript');
    // No subscript class applied either.
    expect(v.dom.querySelector('.cm-md-html-sub')).toBeNull();
    v.destroy();
  });

  it('does not double-apply highlight on CriticMarkup `{== mark ==}` inner `==`', () => {
    const doc = '{== tracked ==}\nnext';
    const v = setup(doc, doc.length);
    const names = nodeNames(v);
    // The inner `==` belongs to CmHighlight, not the regular Highlight node.
    expect(names).not.toContain('Highlight');
    expect(v.dom.querySelector('.cm-md-html-mark')).toBeNull();
    v.destroy();
  });
});

describe('highlightExtras — mode-only rebuild', () => {
  // ── Mode-only transaction regression guard — v0.2.8 codex follow-up shape ──
  // A bare `setEditMode` effect (e.g. user hits Cmd+1 mid-document with no
  // edit and no caret move) must rebuild the field — otherwise Live-mode
  // active-line raw markers stay visible after switching to Document mode.
  it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = '==hi==';
    const v = setup(doc, 2, 'typora'); // caret inside, Live mode
    // Baseline: caret-on-mark line shows raw `==` source — no hidden markers.
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBe(0);
    expect(v.dom.textContent ?? '').toContain('==');
    // Mode-only transaction: no `changes`, no `selection`.
    v.dispatch({ effects: setEditMode.of('wysiwyg') });
    // After the effect, Document mode must have collapsed the markers.
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThanOrEqual(2);
    v.destroy();
  });
});
