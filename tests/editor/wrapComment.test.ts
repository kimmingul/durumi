import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wrapComment } from '../../src/editor/keymap/wrapComment';

function setup(doc: string, anchor: number, head: number = anchor) {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head },
    }),
  });
}

describe('wrapComment', () => {
  it('wraps a non-empty selection with `%% … %%`', () => {
    const v = setup('hello world', 6, 11); // selects "world"
    wrapComment(v);
    expect(v.state.doc.toString()).toBe('hello %% world %%');
    const sel = v.state.selection.main;
    expect(v.state.sliceDoc(sel.from, sel.to)).toBe('world');
    v.destroy();
  });

  it('inserts an empty `%%  %%` when there is no selection', () => {
    const v = setup('abc', 1, 1);
    wrapComment(v);
    expect(v.state.doc.toString()).toBe('a%%  %%bc');
    // Caret should land between the two spaces.
    expect(v.state.selection.main.head).toBe(4);
    v.destroy();
  });

  it('trims surrounding whitespace inside the selection', () => {
    const v = setup('hi  spaced  bye', 2, 12); // selects "  spaced  "
    wrapComment(v);
    expect(v.state.doc.toString()).toBe('hi%% spaced %%bye');
    v.destroy();
  });
});
