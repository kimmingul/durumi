import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { nextMemo, prevMemo } from '../../src/editor/keymap/memoNav';

function setup(doc: string, anchor: number): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor } }),
  });
}

describe('memoNav.nextMemo', () => {
  it('returns false and does nothing when no memos exist', () => {
    const v = setup('plain text without memos', 0);
    expect(nextMemo(v)).toBe(false);
    expect(v.state.selection.main.head).toBe(0);
    v.destroy();
  });

  it('jumps to the first memo when caret is before any memo', () => {
    const doc = 'before %% one %% middle %% two %% end';
    const v = setup(doc, 0);
    expect(nextMemo(v)).toBe(true);
    // first memo is at index 7 (`%%`)
    expect(v.state.selection.main.head).toBe(doc.indexOf('%% one %%'));
    v.destroy();
  });

  it('jumps to the next memo past the caret', () => {
    const doc = 'before %% one %% middle %% two %% end';
    const firstFrom = doc.indexOf('%% one %%');
    const v = setup(doc, firstFrom + 1); // caret inside first memo
    expect(nextMemo(v)).toBe(true);
    expect(v.state.selection.main.head).toBe(doc.indexOf('%% two %%'));
    v.destroy();
  });

  it('wraps around to the first memo when caret is past the last memo', () => {
    const doc = 'before %% one %% middle %% two %% end';
    const v = setup(doc, doc.length); // EOF
    expect(nextMemo(v)).toBe(true);
    expect(v.state.selection.main.head).toBe(doc.indexOf('%% one %%'));
    v.destroy();
  });
});

describe('memoNav.prevMemo', () => {
  it('returns false when no memos exist', () => {
    const v = setup('plain text', 0);
    expect(prevMemo(v)).toBe(false);
    v.destroy();
  });

  it('jumps to the previous memo before the caret', () => {
    const doc = 'before %% one %% middle %% two %% end';
    const secondFrom = doc.indexOf('%% two %%');
    const v = setup(doc, secondFrom + 2); // caret inside second memo
    expect(prevMemo(v)).toBe(true);
    expect(v.state.selection.main.head).toBe(doc.indexOf('%% one %%'));
    v.destroy();
  });

  it('wraps around to the last memo when caret is at start', () => {
    const doc = 'before %% one %% middle %% two %% end';
    const v = setup(doc, 0);
    expect(prevMemo(v)).toBe(true);
    expect(v.state.selection.main.head).toBe(doc.indexOf('%% two %%'));
    v.destroy();
  });

  it('handles a single memo (wraps to itself from anywhere)', () => {
    const doc = 'aa %% only %% bb';
    const onlyFrom = doc.indexOf('%% only %%');
    const v = setup(doc, doc.length);
    expect(prevMemo(v)).toBe(true);
    expect(v.state.selection.main.head).toBe(onlyFrom);
    v.destroy();
  });
});
