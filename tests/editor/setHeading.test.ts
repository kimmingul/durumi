import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setHeading } from '../../src/editor/keymap/setHeading';

function v(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor: cursor } }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('setHeading', () => {
  it('adds H2 markers when line has none', () => {
    const view = v('Hello', 0);
    setHeading(view, 2);
    expect(view.state.doc.toString()).toBe('## Hello');
    view.destroy();
  });
  it('replaces existing heading level', () => {
    const view = v('# Hello', 0);
    setHeading(view, 3);
    expect(view.state.doc.toString()).toBe('### Hello');
    view.destroy();
  });
  it('removes when same level toggled', () => {
    const view = v('## Hello', 0);
    setHeading(view, 2);
    expect(view.state.doc.toString()).toBe('Hello');
    view.destroy();
  });
});
