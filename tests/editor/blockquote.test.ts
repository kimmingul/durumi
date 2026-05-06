import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { blockquoteDecoration } from '../../src/editor/decorations/blockquote';

function setup(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), blockquoteDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('blockquote decoration', () => {
  it('applies cm-md-blockquote line class', () => {
    const v = setup('> quoted line\n', 0);
    expect(v.dom.innerHTML).toContain('cm-md-blockquote');
    v.destroy();
  });
});
