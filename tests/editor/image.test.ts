import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { imageDecoration } from '../../src/editor/decorations/image';

function setup(doc: string, cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), imageDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('image decoration', () => {
  it('inserts an <img> widget when cursor off-line', () => {
    const v = setup('![alt](https://example.com/x.png)\nnext', 35);
    const img = v.dom.querySelector('img.cm-md-image');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/x.png');
    expect(img?.getAttribute('alt')).toBe('alt');
    v.destroy();
  });
  it('shows source markdown when cursor on line', () => {
    const v = setup('![alt](https://example.com/x.png)', 2);
    expect(v.dom.querySelector('img.cm-md-image')).toBeNull();
    v.destroy();
  });
});
