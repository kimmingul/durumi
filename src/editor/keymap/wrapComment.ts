import type { EditorView } from '@codemirror/view';

/**
 * Wraps the current selection in `%% … %%` so the user can add a memo
 * around any text. With no selection, inserts an empty `%%  %%` and lands
 * the caret in the middle so the user can start typing immediately.
 *
 * Distinct from `toggleWrap('%%')` because we don't want unwrap behavior:
 * `%% memo %%` is a memo, not a "selection toggle"; if the user wants to
 * remove a memo they should select it including the markers and delete.
 */
export function wrapComment(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    const insert = '%%  %%';
    view.dispatch({
      changes: { from, to, insert },
      // Caret between the two spaces.
      selection: { anchor: from + 3 },
    });
    return true;
  }
  const text = view.state.sliceDoc(from, to);
  // Tolerate whitespace edges so `%% selection %%` reads cleanly even when
  // the user selected with surrounding spaces.
  const trimmed = text.trim();
  const insert = `%% ${trimmed} %%`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 3, head: from + 3 + trimmed.length },
  });
  return true;
}
