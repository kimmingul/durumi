import { describe, it, expect } from 'vitest';
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
          extensions: [GFM, FootnoteExtension, CitationExtension],
        }),
        citationDecoration(),
        citationTheme,
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

describe('citationDecoration — mode-only rebuild', () => {
  // ── Mode-only transaction regression guard — v0.2.8 codex follow-up ──
  // The citation field had the same latent `tr.docChanged || tr.selection`
  // short-circuit that the memo / CriticMarkup fields had. With the caret
  // sitting on a `[@key]` span in Live mode, the raw source is shown; on
  // a bare `setEditMode.of('wysiwyg')` (no doc change, no selection change)
  // the field must rebuild and collapse the span to the `[n]` superscript.
  it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = 'See [@a] body.';
    const v = setup(doc, 6); // caret inside `[@a]`, Live (typora) mode
    // Baseline: caret-on-citation reveals the raw `[@a]` source — no widget.
    expect(v.dom.querySelector('.cm-md-citation')).toBeNull();
    expect(v.dom.textContent ?? '').toContain('[@a]');
    // Mode-only transaction: no `changes`, no `selection`.
    v.dispatch({ effects: setEditMode.of('wysiwyg') });
    // After the effect, Document mode must have collapsed the citation to a `[1]` widget.
    expect(v.dom.querySelector('.cm-md-citation')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('[@a]');
    v.destroy();
  });
});
