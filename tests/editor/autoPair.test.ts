import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autoPair } from '../../src/editor/keymap/autoPair';

function setup(doc: string, anchor: number, head?: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor, head: head ?? anchor },
    extensions: [autoPair()],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
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

describe('autoPair', () => {
  it('inserts the closing pair for ( and places caret between', () => {
    const view = setup('', 0);
    type(view, '(');
    expect(view.state.doc.toString()).toBe('()');
    expect(view.state.selection.main.head).toBe(1);
    view.destroy();
  });

  it('wraps the selection when typing * over selected text', () => {
    const view = setup('hello world', 6, 11);
    type(view, '*');
    expect(view.state.doc.toString()).toBe('hello *world*');
    // Selection covers the inner text after wrap.
    expect(view.state.selection.main.from).toBe(7);
    expect(view.state.selection.main.to).toBe(12);
    view.destroy();
  });

  it('wraps with `=` (highlight) but does not auto-close on empty cursor', () => {
    const view = setup('hi', 0, 2);
    type(view, '=');
    expect(view.state.doc.toString()).toBe('=hi=');
    view.destroy();

    const view2 = setup('', 0);
    type(view2, '=');
    expect(view2.state.doc.toString()).toBe('=');
    view2.destroy();
  });

  it('still auto-closes [, {, ", and `', () => {
    for (const [open, close] of [['[', ']'], ['{', '}'], ['"', '"'], ['`', '`']] as const) {
      const view = setup('', 0);
      type(view, open);
      expect(view.state.doc.toString()).toBe(open + close);
      view.destroy();
    }
  });
});
