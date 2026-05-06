import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { codeBlockDecoration } from '../../src/editor/decorations/codeBlock';

function setup(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), codeBlockDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('codeBlock decoration', () => {
  it('applies cm-md-code-block to fenced code lines', () => {
    const v = setup('```\nhello\n```\n', 0);
    expect(v.dom.innerHTML).toContain('cm-md-code-block');
    v.destroy();
  });
});
