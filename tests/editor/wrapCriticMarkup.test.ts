import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  wrapCmInsert,
  wrapCmDelete,
  wrapCmSubstitute,
  wrapCmHighlight,
  wrapCmComment,
} from '../../src/editor/keymap/wrapCriticMarkup';

function setup(doc: string, anchor: number, head: number = anchor): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head },
    }),
  });
}

describe('wrapCmInsert', () => {
  it('wraps a non-empty selection with `{++ … ++}`', () => {
    const v = setup('hello world', 6, 11); // selects "world"
    wrapCmInsert(v);
    expect(v.state.doc.toString()).toBe('hello {++ world ++}');
    const sel = v.state.selection.main;
    expect(v.state.sliceDoc(sel.from, sel.to)).toBe('world');
    v.destroy();
  });

  it('inserts an empty `{++  ++}` with caret centered when no selection', () => {
    const v = setup('abc', 1, 1);
    wrapCmInsert(v);
    expect(v.state.doc.toString()).toBe('a{++  ++}bc');
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });
});

describe('wrapCmDelete', () => {
  it('wraps a non-empty selection with `{-- … --}`', () => {
    const v = setup('hello world', 6, 11);
    wrapCmDelete(v);
    expect(v.state.doc.toString()).toBe('hello {-- world --}');
    v.destroy();
  });

  it('inserts an empty `{--  --}` with caret centered when no selection', () => {
    const v = setup('abc', 1, 1);
    wrapCmDelete(v);
    expect(v.state.doc.toString()).toBe('a{--  --}bc');
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });
});

describe('wrapCmHighlight', () => {
  it('wraps a non-empty selection with `{== … ==}`', () => {
    const v = setup('hello world', 6, 11);
    wrapCmHighlight(v);
    expect(v.state.doc.toString()).toBe('hello {== world ==}');
    v.destroy();
  });

  it('inserts an empty `{==  ==}` with caret centered when no selection', () => {
    const v = setup('abc', 1, 1);
    wrapCmHighlight(v);
    expect(v.state.doc.toString()).toBe('a{==  ==}bc');
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });
});

describe('wrapCmComment', () => {
  it('wraps a non-empty selection with `{>> … <<}`', () => {
    const v = setup('hello world', 6, 11);
    wrapCmComment(v);
    expect(v.state.doc.toString()).toBe('hello {>> world <<}');
    v.destroy();
  });

  it('inserts an empty `{>>  <<}` with caret centered when no selection', () => {
    const v = setup('abc', 1, 1);
    wrapCmComment(v);
    expect(v.state.doc.toString()).toBe('a{>>  <<}bc');
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });
});

describe('wrapCmSubstitute', () => {
  it('wraps a non-empty selection and lands caret in the empty NEW slot', () => {
    const v = setup('hello world', 6, 11); // "world"
    wrapCmSubstitute(v);
    expect(v.state.doc.toString()).toBe('hello {~~ world ~>  ~~}');
    // Layout from start of insertion (offset 6):
    //  6: '{'   7: '~'   8: '~'   9: ' '
    // 10..14: 'world'
    // 15: ' '  16: '~'  17: '>'  18: ' '
    // 19: ' ' (caret here — between '~> ' and ' ~~}')
    // 20: '~'  21: '~'  22: '}'
    expect(v.state.selection.main.head).toBe(19);
    v.destroy();
  });

  it('inserts `{~~  ~>  ~~}` with caret in the OLD slot when no selection', () => {
    const v = setup('abc', 1, 1);
    wrapCmSubstitute(v);
    expect(v.state.doc.toString()).toBe('a{~~  ~>  ~~}bc');
    // From offset 1: '{~~ ' ends at 5; caret expected at 5.
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });

  it('trims whitespace edges from a selection', () => {
    const v = setup('hi  spaced  bye', 2, 12); // "  spaced  "
    wrapCmSubstitute(v);
    expect(v.state.doc.toString()).toBe('hi{~~ spaced ~>  ~~}bye');
    v.destroy();
  });
});
