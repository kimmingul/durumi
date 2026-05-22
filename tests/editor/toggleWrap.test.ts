import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wrapSelection, unwrapIfWrapped, toggleWrap } from '../../src/editor/keymap/toggleWrap';

function makeView(doc: string, anchor: number, head: number) {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  return new EditorView({ state, parent: document.body.appendChild(document.createElement('div')) });
}

describe('toggleWrap', () => {
  it('wraps a non-wrapped selection', () => {
    const v = makeView('hello world', 0, 5);
    wrapSelection(v, '**', '**');
    expect(v.state.doc.toString()).toBe('**hello** world');
    v.destroy();
  });
  it('unwraps when selection is already wrapped', () => {
    const v = makeView('**hello** world', 2, 7);
    unwrapIfWrapped(v, '**', '**');
    expect(v.state.doc.toString()).toBe('hello world');
    v.destroy();
  });
});

describe('toggleWrap — empty selection with placeholder (v0.2.29)', () => {
  it('empty selection inserts `before + placeholder + after` and selects the placeholder', () => {
    const v = makeView('hello ', 6, 6);
    toggleWrap(v, '**', '**', '굵게');
    expect(v.state.doc.toString()).toBe('hello **굵게**');
    const sel = v.state.selection.main;
    // anchor at start of placeholder, head at end of placeholder
    expect(sel.from).toBe(8);
    expect(sel.to).toBe(10);
    v.destroy();
  });

  it('non-empty selection still wraps the selection, ignoring the placeholder', () => {
    const v = makeView('hello world', 6, 11); // 'world' selected
    toggleWrap(v, '**', '**', '굵게');
    expect(v.state.doc.toString()).toBe('hello **world**');
    v.destroy();
  });

  it('no placeholder + empty selection falls back to existing behaviour (BC for non-toolbar callers)', () => {
    const v = makeView('hello ', 6, 6);
    toggleWrap(v, '**');
    expect(v.state.doc.toString()).toBe('hello ****');
    v.destroy();
  });

  it('does NOT produce HorizontalRule-parsing source on empty line + Bold', () => {
    const v = makeView('', 0, 0);
    toggleWrap(v, '**', '**', '굵게');
    expect(v.state.doc.toString()).toBe('**굵게**');
    expect(v.state.doc.toString()).not.toBe('****');
    v.destroy();
  });

  it('does NOT produce FencedCode-parsing source on empty line + Strike', () => {
    const v = makeView('', 0, 0);
    toggleWrap(v, '~~', '~~', '취소선');
    expect(v.state.doc.toString()).toBe('~~취소선~~');
    expect(v.state.doc.toString()).not.toBe('~~~~');
    v.destroy();
  });
});
