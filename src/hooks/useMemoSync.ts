import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { replaceMemo, type Comment } from '@shared/comments';

const DEBOUNCE_MS = 300;

interface UseMemoSyncArgs {
  view: EditorView | null;
  /** The parsed memo as it currently exists in the source. */
  memo: Comment;
  /** Local card body (mirrors `memo.text`). */
  localBody: string;
  /** Local card tag (mirrors `memo.tag`). */
  localTag: string | null;
}

/**
 * Two-way binding between a `MemoCard`'s local form state and the underlying
 * markdown source. After 300ms of quiet local editing we splice a new memo
 * into the editor via `replaceMemo`. Source-driven changes (the user typed in
 * the editor) flow back via the `memo` prop and bypass the sync — the caller
 * is responsible for keeping local state in sync with `memo` (e.g. resetting
 * on `memo.from`/`memo.to` changes).
 *
 * Important: skips the dispatch when local state matches the source already,
 * which is the entire reason we don't loop when the editor's parse re-creates
 * the memo with identical text.
 */
export function useMemoSync({ view, memo, localBody, localTag }: UseMemoSyncArgs): void {
  // Track the latest "as flushed to source" snapshot so we don't re-dispatch
  // identical edits that came back via the prop.
  const lastFlushedRef = useRef<{ body: string; tag: string | null }>({
    body: memo.text,
    tag: memo.tag,
  });
  // When the memo prop changes (because source changed), refresh the snapshot
  // so we don't immediately re-flush the same text.
  useEffect(() => {
    lastFlushedRef.current = { body: memo.text, tag: memo.tag };
  }, [memo.from, memo.to, memo.text, memo.tag]);

  useEffect(() => {
    if (!view) return;
    const trimmedBody = localBody.trim();
    if (trimmedBody.length === 0) return;
    const last = lastFlushedRef.current;
    if (trimmedBody === last.body && localTag === last.tag) return;
    const id = setTimeout(() => {
      const v = view;
      if (!v) return;
      const src = v.state.doc.toString();
      // Re-resolve the memo by its current `from` — it may have shifted if
      // the user typed earlier in the doc.
      const result = replaceMemo(src, memo, { tag: localTag, body: trimmedBody });
      if (result.newSrc === src) return;
      v.dispatch({
        changes: { from: 0, to: src.length, insert: result.newSrc },
        // Avoid stealing the caret: keep the user's selection where it was if
        // it still fits. CodeMirror clamps automatically on out-of-range.
        selection: v.state.selection,
        userEvent: 'input.memo-sync',
      });
      lastFlushedRef.current = { body: trimmedBody, tag: localTag };
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [view, memo, localBody, localTag]);
}
