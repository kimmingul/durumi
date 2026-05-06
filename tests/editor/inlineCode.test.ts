import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { inlineCodeDecoration } from '../../src/editor/decorations/inlineCode';

function setup(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), inlineCodeDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('inlineCode decoration', () => {
  it('applies cm-md-inline-code class', () => {
    const v = setup('a `code` b', 0);
    expect(v.dom.innerHTML).toContain('cm-md-inline-code');
    v.destroy();
  });
  it('hides backticks when cursor off-line', () => {
    const v = setup('a `code` b\nnext', 12);
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThan(0);
    v.destroy();
  });
});
