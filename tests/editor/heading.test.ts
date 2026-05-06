import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { headingDecoration } from '../../src/editor/decorations/heading';

function setup(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown(), headingDecoration()],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

describe('heading decoration', () => {
  it('applies cm-md-h1 class to heading text', () => {
    const view = setup('# Hello\n\nbody', 0);
    expect(view.dom.innerHTML).toContain('cm-md-h1');
    view.destroy();
  });

  it('hides "# " marker when cursor is on a different line', () => {
    const view = setup('# Hello\n\nbody', 10);
    const hidden = view.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('shows "# " marker when cursor is on the heading line', () => {
    const view = setup('# Hello\n\nbody', 2);
    const hidden = view.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBe(0);
    view.destroy();
  });
});
