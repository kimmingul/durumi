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
  it('escapes `[` even though autoPair has it in PAIRS_FULL', () => {
    const view = setupView();
    type(view, '[');
    expect(view.state.doc.toString()).toBe('\\[');
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

  it('builds `\\[Text\\]` when typing the whole sequence', () => {
    const view = setupView();
    for (const ch of '[Text]') type(view, ch);
    expect(view.state.doc.toString()).toBe('\\[Text\\]');
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
