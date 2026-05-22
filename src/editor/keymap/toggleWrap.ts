import type { EditorView } from '@codemirror/view';

export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder?: string,
): boolean {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  // v0.2.29 — empty selection + placeholder: insert the placeholder
  // text *selected* so the next keystroke replaces it. This avoids
  // transient malformed source like `****` (parses as HorizontalRule)
  // and `~~~~` (parses as FencedCode) which would otherwise render a
  // block widget on top of the user's just-clicked toolbar action and
  // wreck IME composition. See docs/DOCUMENT_MODE_PRINCIPLES.md §2 / §6.
  if (from === to && placeholder) {
    const insert = `${before}${placeholder}${after}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: {
        anchor: from + before.length,
        head: from + before.length + placeholder.length,
      },
    });
    return true;
  }
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

export function toggleWrap(
  view: EditorView,
  before: string,
  after: string = before,
  placeholder?: string,
): boolean {
  if (unwrapIfWrapped(view, before, after)) return true;
  return wrapSelection(view, before, after, placeholder);
}

/**
 * Wrap the current selection in `<sup>…</sup>` (toggles off when the
 * selection is already wrapped). Markdown-it has no native superscript syntax,
 * so the raw HTML round-trips cleanly through every renderer in Durumi.
 *
 * v0.2.29 — empty selection inserts `<sup>위첨자</sup>` with the placeholder
 * selected instead of the malformed `<sup></sup>` zero-width slot.
 */
export function toggleSup(view: EditorView): boolean {
  return toggleWrap(view, '<sup>', '</sup>', '위첨자');
}

/**
 * Wrap the current selection in `<sub>…</sub>` (toggles off when already
 * wrapped). Same rationale as `toggleSup`.
 */
export function toggleSub(view: EditorView): boolean {
  return toggleWrap(view, '<sub>', '</sub>', '첨자');
}
