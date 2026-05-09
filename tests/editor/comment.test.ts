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

describe('commentDecoration (v0.1.3 chat-icon design)', () => {
  it('hides the entire memo body when caret is off the line', () => {
    const doc = 'hello %% @ai sensitive note %% world\nnext';
    const v = setup(doc, doc.length); // caret on `next` line
    // Body text should NOT be in the rendered DOM at all.
    expect(v.dom.textContent ?? '').not.toContain('sensitive note');
    expect(v.dom.textContent ?? '').not.toContain('@ai');
    v.destroy();
  });

  it('renders a chat icon at the memo line-end, color-coded by tag', () => {
    const doc = 'hello %% @ai note %% world\nnext';
    const v = setup(doc, doc.length);
    const icon = v.dom.querySelector('.cm-memo-chat-icon');
    expect(icon).toBeTruthy();
    expect(icon?.classList.contains('cm-memo-chat-icon-ai')).toBe(true);
    expect(icon?.getAttribute('data-memo-from')).toBe(String(doc.indexOf('%% @ai')));
    v.destroy();
  });

  it('clicking the chat icon dispatches a `durumi:memo-focus` event with the memo `from`', () => {
    const doc = 'hello %% @todo important %% world\nnext';
    const v = setup(doc, doc.length);
    const icon = v.dom.querySelector('.cm-memo-chat-icon') as HTMLElement;
    expect(icon).toBeTruthy();
    let received: { from: number } | null = null;
    v.dom.addEventListener('durumi:memo-focus', (e) => {
      received = (e as CustomEvent<{ from: number }>).detail;
    });
    icon.click();
    expect(received).not.toBeNull();
    expect(received!.from).toBe(doc.indexOf('%% @todo'));
    v.destroy();
  });

  it('keeps the source visible when the caret is on the comment line', () => {
    const doc = 'hello %% @ai note %% world';
    const v = setup(doc, 12); // caret inside comment
    expect(v.dom.textContent ?? '').toContain('@ai note');
    // No chat icon when source is visible.
    expect(v.dom.querySelector('.cm-memo-chat-icon')).toBeNull();
    v.destroy();
  });

  it('renders an untagged chat icon for memos without a tag', () => {
    const doc = 'before %% just a note %% after\nnext';
    const v = setup(doc, doc.length);
    const icon = v.dom.querySelector('.cm-memo-chat-icon');
    expect(icon).toBeTruthy();
    expect(icon?.classList.contains('cm-memo-chat-icon-untagged')).toBe(true);
    v.destroy();
  });

  it('handles a multiline block memo — body hidden, icon at the closing-line end', () => {
    const doc = '%%\n@reviewer cohort question\nfollowup\n%%\n\nbody';
    const v = setup(doc, doc.length); // caret on `body`
    expect(v.dom.textContent ?? '').not.toContain('cohort question');
    expect(v.dom.textContent ?? '').not.toContain('followup');
    const icon = v.dom.querySelector('.cm-memo-chat-icon');
    expect(icon).toBeTruthy();
    expect(icon?.classList.contains('cm-memo-chat-icon-reviewer')).toBe(true);
    v.destroy();
  });

  it('does not decorate code-fence content', () => {
    const doc = '```\n%% looks like a memo %%\n```\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelector('.cm-memo-chat-icon')).toBeNull();
    v.destroy();
  });
});
