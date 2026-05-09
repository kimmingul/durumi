import type { EditorView } from '@codemirror/view';

/**
 * CriticMarkup wrap helpers — five operators surfaced via the Review menu and
 * the editor's right-click context menu.
 *
 * Mirrors `wrapComment` in shape: with a non-empty selection, wrap the trimmed
 * text inside the operator's delimiters and select the inner text. With no
 * selection, insert an empty template and park the caret in a sensible inner
 * slot so the user can start typing immediately.
 *
 * No keyboard shortcuts are wired — these are exposed only via the menu and
 * context menu (intentional; CriticMarkup is review-time only and we don't
 * want to burn five more accelerators).
 */

function wrapWith(
  view: EditorView,
  open: string,
  close: string,
): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    // Empty template: `{++  ++}` — caret between the two spaces.
    const insert = `${open}  ${close}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + open.length + 1 },
    });
    return true;
  }
  const text = view.state.sliceDoc(from, to);
  const trimmed = text.trim();
  const insert = `${open} ${trimmed} ${close}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: {
      anchor: from + open.length + 1,
      head: from + open.length + 1 + trimmed.length,
    },
  });
  return true;
}

export function wrapCmInsert(view: EditorView): boolean {
  return wrapWith(view, '{++', '++}');
}

export function wrapCmDelete(view: EditorView): boolean {
  return wrapWith(view, '{--', '--}');
}

export function wrapCmHighlight(view: EditorView): boolean {
  return wrapWith(view, '{==', '==}');
}

export function wrapCmComment(view: EditorView): boolean {
  return wrapWith(view, '{>>', '<<}');
}

/**
 * Substitution is special: there are two slots (old, new) separated by `~>`.
 *
 *  - With selection → `{~~ <selection> ~> <empty> ~~}` and the caret lands in
 *    the empty NEW slot (right after the space following `~>`) so the user
 *    can immediately type the replacement.
 *  - Without selection → `{~~  ~>  ~~}` with caret in the OLD slot (right
 *    after the first space) so the user fills in the original text first.
 */
export function wrapCmSubstitute(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    const insert = '{~~  ~>  ~~}';
    view.dispatch({
      changes: { from, to, insert },
      // After `{~~ ` — index 4 from `from`.
      selection: { anchor: from + 4 },
    });
    return true;
  }
  const text = view.state.sliceDoc(from, to);
  const trimmed = text.trim();
  const insert = `{~~ ${trimmed} ~>  ~~}`;
  // Caret right after `~> ` (between the two spaces around the empty NEW slot).
  // Layout: `{~~ <trimmed> ~>  ~~}`
  //          0123 4..       ↑ here = 4 + trimmed.length + 4
  const caret = from + 4 + trimmed.length + 4;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: caret },
  });
  return true;
}
