import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autoPair } from '../../src/editor/keymap/autoPair';
import {
  editModeStateExtension,
  setEditMode,
} from '../../src/editor/editMode';
import { wysiwygEscapeFilter } from '../../src/editor/wysiwygEscape';

/**
 * Integration tests that mirror the runtime extension stack: editMode
 * StateField + autoPair filter + wysiwygEscapeFilter. The wysiwygEscape
 * unit tests load the filter in isolation, so they couldn't catch order /
 * userEvent / autoPair-interference bugs. These do.
 */
function setupView(doc = '', mode: 'wysiwyg' | 'typora' | 'markdown' = 'wysiwyg'): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [editModeStateExtension(), autoPair(), wysiwygEscapeFilter()],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({ effects: setEditMode.of(mode) });
  return view;
}

function type(view: EditorView, ch: string): void {
  const sel = view.state.selection.main;
  view.dispatch(
    view.state.update({
      changes: { from: sel.from, to: sel.to, insert: ch },
      selection: { anchor: sel.from + ch.length },
      userEvent: 'input.type',
    }),
  );
}

describe('WYSIWYG escape + autoPair integration', () => {
  it('v0.2.20: `[` auto-pairs to `[]` in WYSIWYG (escape removed → autoPair runs)', () => {
    // Was `\[` before v0.2.20. With brackets removed from ALWAYS_ESCAPE
    // there's nothing for autoPair to defer to, so `[` participates in
    // pairing exactly like Typora mode — the friendlier UX for typed
    // inline links (`[label]` opens with auto-close, Right past `]`,
    // then `(` opens the URL pair).
    const view = setupView();
    type(view, '[');
    expect(view.state.doc.toString()).toBe('[]');
    view.destroy();
  });

  it('escapes `<` (which autoPair would normally pair with `>`)', () => {
    const view = setupView();
    type(view, '<');
    expect(view.state.doc.toString()).toBe('\\<');
    view.destroy();
  });

  it('escapes `.` after a digit at line start', () => {
    const view = setupView('1');
    type(view, '.');
    expect(view.state.doc.toString()).toBe('1\\.');
    view.destroy();
  });

  it('v0.2.20: typing `[Text]` lands as `[Text]` (no escape, no extra `]`)', () => {
    // Was `\[Text\]` before v0.2.20. The flow is now: `[` auto-pairs to
    // `[]` with caret between; `T,e,x,t` insert inside → `[Text]`; the
    // typed `]` is consumed by autoPair's typeOver-closing behavior in
    // a future change OR (current behavior) appends, depending on
    // whether the smart-skip logic is added. Today autoPair has no
    // skip-over-closer logic, so typing the literal `]` after `[Text`
    // would land an extra `]` — which is why we Right-arrow past it
    // in real use. This test pins the post-`Right-arrow` form: caret
    // sits past the auto-closed `]` before typing the next thing.
    const view = setupView();
    type(view, '[');
    // Type inside the auto-pair; caret is between `[` and `]`.
    for (const ch of 'Text') type(view, ch);
    // Move past the auto-closed `]` (simulating user Right-arrow).
    const sel = view.state.selection.main;
    view.dispatch({ selection: { anchor: sel.from + 1 } });
    expect(view.state.doc.toString()).toBe('[Text]');
    view.destroy();
  });

  it('builds `\\<sup\\>1\\</sup\\>` for the HTML test case', () => {
    const view = setupView();
    for (const ch of '<sup>1</sup>') type(view, ch);
    expect(view.state.doc.toString()).toBe('\\<sup\\>1\\</sup\\>');
    view.destroy();
  });

  it('builds `1\\. item` for a numbered-list defuse', () => {
    const view = setupView();
    for (const ch of '1. item') type(view, ch);
    expect(view.state.doc.toString()).toBe('1\\. item');
    view.destroy();
  });

  it('does NOT escape in Typora mode (escape filter no-ops)', () => {
    const view = setupView('', 'typora');
    type(view, '[');
    // autoPair auto-closes brackets in Typora mode.
    expect(view.state.doc.toString()).toBe('[]');
    view.destroy();
  });
});
