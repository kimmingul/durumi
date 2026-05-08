import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { emphasisDecoration } from '../../src/editor/decorations/emphasis';

function setup(doc: string, cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), emphasisDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('emphasis decoration', () => {
  it('applies cm-md-bold to bold range', () => {
    const view = setup('Hello **world** end', 0);
    expect(view.dom.innerHTML).toContain('cm-md-bold');
    view.destroy();
  });
  it('applies cm-md-italic to italic range', () => {
    const view = setup('Hello *world* end', 0);
    expect(view.dom.innerHTML).toContain('cm-md-italic');
    view.destroy();
  });
  it('hides bold markers when cursor not on line', () => {
    const view = setup('Hello **world**\nnext', 16);
    const hidden = view.dom.querySelectorAll('.cm-md-marker-hidden').length;
    expect(hidden).toBeGreaterThan(0);
    view.destroy();
  });
  it('shows bold markers when cursor on line', () => {
    const view = setup('Hello **world**\nnext', 2);
    const hidden = view.dom.querySelectorAll('.cm-md-marker-hidden').length;
    expect(hidden).toBe(0);
    view.destroy();
  });
});
