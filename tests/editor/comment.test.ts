import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { CommentsExtension } from '../../src/editor/markdownExt/comments';
import { commentDecoration, commentTheme } from '../../src/editor/decorations/comment';

function setup(doc: string, cursor: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM, CommentsExtension] }),
        commentDecoration(),
        commentTheme,
      ],
    }),
    parent,
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('commentDecoration', () => {
  it('renders a tag chip + body mark when caret is off the line', () => {
    const doc = 'hello %% @ai note %% world\nnext';
    const v = setup(doc, doc.length);
    const html = v.dom.innerHTML;
    expect(html).toContain('cm-md-comment-chip-ai');
    expect(html).toContain('cm-md-comment');
    v.destroy();
  });

  it('keeps the source visible when the caret is on the comment line', () => {
    const doc = 'hello %% @ai note %% world';
    const v = setup(doc, 12); // caret inside comment
    const html = v.dom.innerHTML;
    // The chip widget shouldn't appear — we should see the literal `%%`
    // markers in the rendered text instead.
    expect(html).not.toContain('cm-md-comment-chip-ai');
    expect(v.dom.textContent).toContain('@ai note');
    v.destroy();
  });

  it('renders untagged memos with a neutral chip', () => {
    const doc = 'before %% just a note %% after\nnext';
    const v = setup(doc, doc.length);
    const html = v.dom.innerHTML;
    expect(html).toContain('cm-md-comment-untagged');
    v.destroy();
  });

  it('handles a multiline block memo', () => {
    const doc = '%%\n@reviewer cohort question\nfollowup\n%%\n\nbody';
    const v = setup(doc, doc.length);
    const html = v.dom.innerHTML;
    expect(html).toContain('cm-md-comment-chip-reviewer');
    v.destroy();
  });

  it('does not decorate code-fence content', () => {
    const doc = '```\n%% looks like a memo %%\n```\nnext';
    const v = setup(doc, doc.length);
    const html = v.dom.innerHTML;
    expect(html).not.toContain('cm-md-comment-chip');
    v.destroy();
  });
});
