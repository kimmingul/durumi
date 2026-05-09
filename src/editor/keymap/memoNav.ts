import { EditorView } from '@codemirror/view';
import { parseComments } from '../../../shared/comments';

/**
 * Move the selection to the next `%% memo %%` after the caret. Wraps to the
 * first memo in the doc if none exist past the caret.
 *
 * Returns `false` (and does nothing) when the document has zero memos so the
 * caller can no-op silently — there is no useful UX for "jump to nothing".
 */
export function nextMemo(view: EditorView): boolean {
  const memos = parseComments(view.state.doc.toString());
  if (memos.length === 0) return false;
  const head = view.state.selection.main.head;
  const target = memos.find((m) => m.from > head) ?? memos[0];
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  return true;
}

/**
 * Move the selection to the memo before the caret. Wraps to the last memo if
 * the caret is at/before the first memo. Returns `false` when there are zero
 * memos in the document.
 *
 * If the caret is currently INSIDE a memo's range, this jumps to the memo
 * before it (not back to the same memo's start) — matching the MS Word
 * "previous comment" UX.
 */
export function prevMemo(view: EditorView): boolean {
  const memos = parseComments(view.state.doc.toString());
  if (memos.length === 0) return false;
  const head = view.state.selection.main.head;
  // Find the LAST memo whose entire range ends at-or-before the caret. This
  // skips the memo the caret may currently sit inside.
  let target = null as null | typeof memos[number];
  for (const m of memos) {
    if (m.to <= head) target = m;
    else break;
  }
  if (!target) target = memos[memos.length - 1];
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  return true;
}
