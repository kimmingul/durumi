import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { linkDecoration } from '../../src/editor/decorations/link';

function setup(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), linkDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('link decoration', () => {
  it('applies cm-md-link class to link text', () => {
    const v = setup('see [text](https://x.com) end', 0);
    expect(v.dom.innerHTML).toContain('cm-md-link');
    v.destroy();
  });
  it('hides brackets and url when cursor off-line', () => {
    const v = setup('see [text](https://x.com)\nnext', 30);
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThan(0);
    v.destroy();
  });
});
