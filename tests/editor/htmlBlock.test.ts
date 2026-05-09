import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  htmlBlockDecoration,
  htmlBlockTheme,
} from '../../src/editor/decorations/htmlBlock';

function setup(doc: string, cursor: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        htmlBlockDecoration(),
        htmlBlockTheme,
      ],
    }),
    parent,
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('htmlBlockDecoration', () => {
  it('marks an HTMLBlock with cm-md-html-block', () => {
    const v = setup('<div>raw html</div>\n', 0);
    expect(v.dom.innerHTML).toContain('cm-md-html-block');
    v.destroy();
  });

  it('marks a CommentBlock with cm-md-html-comment', () => {
    const v = setup('<!-- a note -->\nbody', 0);
    expect(v.dom.innerHTML).toContain('cm-md-html-comment');
    v.destroy();
  });

  it('does not mark inline HTML inside a paragraph', () => {
    // Inline `<sub>` is HTMLTag, not HTMLBlock — htmlBlock decoration must
    // leave it alone so the htmlInline decoration can pair tags later.
    const v = setup('H<sub>2</sub>O', 0);
    expect(v.dom.innerHTML).not.toContain('cm-md-html-block');
    v.destroy();
  });
});
