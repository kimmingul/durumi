import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import {
  hasActiveLine,
  userActiveExtension,
  userActiveField,
} from '../../src/editor/decorations/activeLine';
import { headingDecoration } from '../../src/editor/decorations/heading';

function makeView(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown(), userActiveExtension(), headingDecoration()],
  });
  return new EditorView({
    state,
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('userActiveField', () => {
  it('defaults to false when the editor is freshly initialised', () => {
    const view = makeView('# Hello\nbody', 0);
    expect(view.state.field(userActiveField)).toBe(false);
    expect(hasActiveLine(view.state)).toBe(false);
    view.destroy();
  });

  it('flips true on a user-driven selection set', () => {
    const view = makeView('# Hello\nbody', 0);
    view.dispatch({ selection: { anchor: 2 }, userEvent: 'select' });
    expect(view.state.field(userActiveField)).toBe(true);
    expect(hasActiveLine(view.state)).toBe(true);
    view.destroy();
  });

  it('flips true on input transactions', () => {
    const view = makeView('hello', 5);
    view.dispatch({
      changes: { from: 5, to: 5, insert: '!' },
      userEvent: 'input.type',
    });
    expect(view.state.field(userActiveField)).toBe(true);
    view.destroy();
  });

  it('flips true on delete transactions', () => {
    const view = makeView('hello', 5);
    view.dispatch({
      changes: { from: 4, to: 5, insert: '' },
      userEvent: 'delete.backward',
    });
    expect(view.state.field(userActiveField)).toBe(true);
    view.destroy();
  });

  it('resets to false when the document is fully replaced (file open)', () => {
    const view = makeView('# Hello\nbody', 0);
    view.dispatch({ selection: { anchor: 2 }, userEvent: 'select' });
    expect(view.state.field(userActiveField)).toBe(true);
    // Mirror MarkdownEditor.tsx file-open: replace the entire doc in one shot
    // with NO userEvent (the host app's programmatic swap).
    const len = view.state.doc.length;
    view.dispatch({ changes: { from: 0, to: len, insert: '# Other doc\n' } });
    expect(view.state.field(userActiveField)).toBe(false);
    expect(hasActiveLine(view.state)).toBe(false);
    view.destroy();
  });

  it('does NOT reset on a select-all + type (full-doc replace with input userEvent)', () => {
    const view = makeView('hello', 5);
    view.dispatch({ selection: { anchor: 5 }, userEvent: 'select' });
    expect(view.state.field(userActiveField)).toBe(true);
    const len = view.state.doc.length;
    view.dispatch({
      changes: { from: 0, to: len, insert: 'replaced' },
      userEvent: 'input.type',
    });
    expect(view.state.field(userActiveField)).toBe(true);
    view.destroy();
  });

  it('counts an explicit selectionSet (no userEvent) as user interaction', () => {
    const view = makeView('# Hello\nbody', 0);
    // Plain selection dispatch with no userEvent. Treated as a user
    // interaction because tr.selection is set, mirroring how CodeMirror
    // surfaces explicit selection changes from the host application.
    view.dispatch({ selection: { anchor: 4 } });
    expect(view.state.field(userActiveField)).toBe(true);
    view.destroy();
  });
});

describe('heading marker on a fresh doc (no interactions yet)', () => {
  it('hides the "# " marker even though the caret is at line 1', () => {
    // Real-world repro: open a file whose first line is a heading. The
    // caret defaults to position 0, but the user has not interacted yet,
    // so the marker should already be hidden.
    const view = makeView('# Welcome\n\nbody', 0);
    const hidden = view.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('reveals the "# " marker once the user clicks into the heading line', () => {
    const view = makeView('# Welcome\n\nbody', 0);
    expect(view.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThan(0);
    view.dispatch({ selection: { anchor: 2 }, userEvent: 'select' });
    expect(view.dom.querySelectorAll('.cm-md-marker-hidden').length).toBe(0);
    view.destroy();
  });
});
