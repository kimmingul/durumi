import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { blockquoteDecoration } from '../../src/editor/decorations/blockquote';

function setup(doc: string, cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown(), blockquoteDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  // Simulate user interaction so the active line treatment kicks in.
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('blockquote decoration', () => {
  it('applies cm-md-blockquote line class', () => {
    const v = setup('> quoted line\n', 0);
    expect(v.dom.innerHTML).toContain('cm-md-blockquote');
    v.destroy();
  });

  it('hides "> " marker when caret is on a different line', () => {
    const doc = '> quoted\n\nbody';
    const v = setup(doc, doc.length); // caret on the body line
    const hidden = v.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBeGreaterThan(0);
    v.destroy();
  });

  it('shows "> " marker when caret is on the blockquote line', () => {
    const v = setup('> quoted\n\nbody', 3); // caret inside the quoted text
    const hidden = v.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBe(0);
    v.destroy();
  });

  it('hides nested ">> " markers as a single replacement', () => {
    const doc = '>> nested quote\n\nbody';
    const v = setup(doc, doc.length);
    const hidden = v.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBe(1);
    v.destroy();
  });

  it('does not replace when the line is just `>` with no content', () => {
    const doc = '> first line\n>\n> third line\n\nbody';
    const v = setup(doc, doc.length);
    // Only the two non-empty quoted lines should have markers hidden.
    const hidden = v.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBe(2);
    v.destroy();
  });
});
