import type { EditorView } from '@codemirror/view';

export function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  const insert = `${before}${text}${after}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + before.length, head: from + before.length + text.length },
  });
  return true;
}

export function unwrapIfWrapped(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const beforeLen = before.length;
  const afterLen = after.length;
  if (from < beforeLen) return false;
  const lead = view.state.sliceDoc(from - beforeLen, from);
  const trail = view.state.sliceDoc(to, to + afterLen);
  if (lead !== before || trail !== after) return false;
  view.dispatch({
    changes: [
      { from: to, to: to + afterLen, insert: '' },
      { from: from - beforeLen, to: from, insert: '' },
    ],
    selection: { anchor: from - beforeLen, head: to - beforeLen },
  });
  return true;
}

export function toggleWrap(view: EditorView, before: string, after: string = before): boolean {
  if (unwrapIfWrapped(view, before, after)) return true;
  return wrapSelection(view, before, after);
}

/**
 * Wrap the current selection in `<sup>…</sup>` (toggles off when the
 * selection is already wrapped). Markdown-it has no native superscript syntax,
 * so the raw HTML round-trips cleanly through every renderer in Durumi.
 *
 * For EMPTY selections, the production caller routes through
 * `applyInlineFormat(view, 'sup')` (see `pendingInlineFormat.ts`) which
 * sets a Word-style pending state instead of inserting `<sup></sup>`.
 * This function preserves the legacy direct-wrap behaviour for any
 * non-toolbar caller that might still use it.
 */
export function toggleSup(view: EditorView): boolean {
  return toggleWrap(view, '<sup>', '</sup>');
}

/**
 * Wrap the current selection in `<sub>…</sub>` (toggles off when already
 * wrapped). See `toggleSup` for rationale and the v0.2.29 routing note.
 */
export function toggleSub(view: EditorView): boolean {
  return toggleWrap(view, '<sub>', '</sub>');
}
