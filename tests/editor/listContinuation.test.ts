import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { enterListContinuation } from '../../src/editor/keymap/listContinuation';

function setup(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [keymap.of([enterListContinuation()])],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

function pressEnter(view: EditorView): boolean {
  const k = enterListContinuation();
  return k.run!(view) ?? false;
}

describe('enterListContinuation', () => {
  it('continues a bullet list with the same marker', () => {
    const view = setup('- item one', 10);
    expect(pressEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- item one\n- ');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.destroy();
  });

  it('exits the list when Enter is pressed on an empty bullet', () => {
    const view = setup('- ', 2);
    expect(pressEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
    view.destroy();
  });

  it('bumps the number on ordered lists', () => {
    const view = setup('3. third', 8);
    expect(pressEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('3. third\n4. ');
    view.destroy();
  });

  it('preserves indentation when continuing a nested item', () => {
    const view = setup('  - sub item', 12);
    expect(pressEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('  - sub item\n  - ');
    view.destroy();
  });

  it('continues a task item with an unchecked box', () => {
    const view = setup('- [ ] task', 10);
    expect(pressEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] task\n- [ ] ');
    view.destroy();
  });

  it('returns false (defers to defaultKeymap) when not on a list line', () => {
    const view = setup('plain text', 10);
    expect(pressEnter(view)).toBe(false);
    view.destroy();
  });

  it('returns false when caret is mid-line, not at end', () => {
    const view = setup('- item', 3);
    expect(pressEnter(view)).toBe(false);
    view.destroy();
  });
});
