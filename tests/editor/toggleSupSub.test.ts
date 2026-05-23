import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { toggleSup, toggleSub } from '../../src/editor/keymap/toggleWrap';

function makeView(doc: string, anchor: number, head: number) {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('toggleSup', () => {
  it('wraps a selection with <sup>…</sup>', () => {
    const v = makeView('E=mc2', 4, 5);
    toggleSup(v);
    expect(v.state.doc.toString()).toBe('E=mc<sup>2</sup>');
    v.destroy();
  });
  it('removes <sup> wrapping when toggled on already-wrapped text', () => {
    const v = makeView('E=mc<sup>2</sup>', 9, 10);
    toggleSup(v);
    expect(v.state.doc.toString()).toBe('E=mc2');
    v.destroy();
  });
  it('inserts placeholder selected at the caret when no selection (v0.2.29)', () => {
    // v0.2.29 changed empty-selection toolbar invocations to insert a
    // localized placeholder selected, so the next keystroke replaces
    // it. Previously this inserted `<sup></sup>` — a zero-width slot
    // that disrupted IME composition and toolbar UX.
    const v = makeView('x', 1, 1);
    toggleSup(v);
    expect(v.state.doc.toString()).toBe('x<sup>위첨자</sup>');
    const sel = v.state.selection.main;
    expect(sel.from).toBe(6); // after `<sup>`
    expect(sel.to).toBe(9); // end of `위첨자`
    v.destroy();
  });
});

describe('toggleSub', () => {
  it('wraps a selection with <sub>…</sub>', () => {
    const v = makeView('H2O', 1, 2);
    toggleSub(v);
    expect(v.state.doc.toString()).toBe('H<sub>2</sub>O');
    v.destroy();
  });
  it('removes <sub> wrapping when toggled on already-wrapped text', () => {
    const v = makeView('H<sub>2</sub>O', 6, 7);
    toggleSub(v);
    expect(v.state.doc.toString()).toBe('H2O');
    v.destroy();
  });
  it('inserts placeholder selected at the caret when no selection (v0.2.29)', () => {
    const v = makeView('H', 1, 1);
    toggleSub(v);
    expect(v.state.doc.toString()).toBe('H<sub>첨자</sub>');
    const sel = v.state.selection.main;
    expect(sel.from).toBe(6); // after `<sub>`
    expect(sel.to).toBe(8); // end of `첨자`
    v.destroy();
  });
});
