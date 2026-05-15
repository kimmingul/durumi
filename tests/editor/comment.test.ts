import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { CommentsExtension } from '../../src/editor/markdownExt/comments';
import { commentDecoration, commentTheme } from '../../src/editor/decorations/comment';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

function setup(doc: string, cursor: number, mode: EditMode = 'typora') {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        editModeStateExtension(),
        markdown({ base: markdownLanguage, extensions: [GFM, CommentsExtension] }),
        commentDecoration(),
        commentTheme,
      ],
    }),
    parent,
  });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
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

  it('keeps the source visible when the caret is on the comment line (Live mode)', () => {
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

  // ── Document mode (WYSIWYG) parity — v0.2.8 ──
  // In Document mode the active-line carve-out is gone: even when the
  // caret is on a memo line, the body must stay hidden and the chat
  // icon must remain so the page reads uniformly. Mirrors invariants
  // #1 (mode-aware rendering) and #6 (IME-safe inline marker hide).

  it('Document mode: keeps the memo body hidden even when caret is on the memo line', () => {
    const doc = 'hello %% @ai note %% world';
    const v = setup(doc, 12, 'wysiwyg'); // caret inside comment
    // Body text must NOT appear; the source-on-active-line carve-out
    // is intentionally suppressed in Document mode.
    expect(v.dom.textContent ?? '').not.toContain('@ai note');
    // The active-line "raw" highlight class must NOT appear.
    expect(v.dom.querySelector('.cm-memo-active')).toBeNull();
    v.destroy();
  });

  it('Document mode: renders the chat icon on the active memo line', () => {
    const doc = 'hello %% @ai note %% world\nnext';
    const v = setup(doc, 12, 'wysiwyg'); // caret inside the memo
    const icon = v.dom.querySelector('.cm-memo-chat-icon');
    expect(icon).toBeTruthy();
    expect(icon?.classList.contains('cm-memo-chat-icon-ai')).toBe(true);
    v.destroy();
  });

  it('Document mode: multiline block memo stays collapsed on every line', () => {
    const doc = '%%\n@reviewer cohort question\nfollowup\n%%\n\nbody';
    // Caret on the inner `cohort question` line — that line would be
    // active under Live mode and reveal raw `%%`. In Document mode it
    // must remain collapsed.
    const insidePos = doc.indexOf('cohort');
    const v = setup(doc, insidePos, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('cohort question');
    expect(v.dom.textContent ?? '').not.toContain('followup');
    expect(v.dom.querySelector('.cm-memo-active')).toBeNull();
    const icon = v.dom.querySelector('.cm-memo-chat-icon');
    expect(icon).toBeTruthy();
    v.destroy();
  });

  // ── Mode-only transaction regression guard — v0.2.8 codex follow-up ──
  // The decoration field must rebuild when a `setEditMode` effect arrives,
  // even if the transaction has no doc change and no selection change. Prior
  // to the fix, `update()` short-circuited on `tr.docChanged || tr.selection`,
  // leaving the previous mode's decorations stale until the next keystroke.
  it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = 'hello %% @ai note %% world';
    const v = setup(doc, 12); // caret inside the memo, Live (typora) mode
    // Baseline: Live-mode active-line carve-out shows the raw `%%` highlight.
    expect(v.dom.querySelector('.cm-memo-active')).toBeTruthy();
    // Mode-only transaction: no `changes`, no `selection`.
    v.dispatch({ effects: setEditMode.of('wysiwyg') });
    // After the effect, Document mode must have removed the active-line carve-out.
    expect(v.dom.querySelector('.cm-memo-active')).toBeNull();
    v.destroy();
  });
});
