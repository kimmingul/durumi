import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { listDecoration } from '../../src/editor/decorations/list';

function setup(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), listDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('list decoration', () => {
  it('applies cm-md-list-item line class', () => {
    const v = setup('- one\n- two\n', 0);
    expect(v.dom.innerHTML).toContain('cm-md-list-item');
    v.destroy();
  });
});
