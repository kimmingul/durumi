import { StateField, Transaction, type EditorState, type Extension } from '@codemirror/state';

export interface ActiveLineRange {
  from: number;
  to: number;
  number: number;
}

export function getActiveLineRange(state: EditorState): ActiveLineRange {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { from: line.from, to: line.to, number: line.number };
}

export function isLineActive(state: EditorState, lineNumber: number): boolean {
  return getActiveLineRange(state).number === lineNumber;
}

/**
 * Tracks whether the user has interacted with the document yet.
 *
 * Default: `false`. While false, no line is treated as "active" for live
 * decoration purposes — that prevents the first line of a freshly-opened doc
 * from showing its raw `#` / `>` markers just because CodeMirror placed the
 * caret at position 0.
 *
 * Flips to `true` on the first user-driven transaction (typing, deleting,
 * pointer/keyboard selection, an explicit `selectionSet`).
 *
 * Flips back to `false` when the entire document is replaced in one shot —
 * that's how `MarkdownEditor.tsx` swaps content on file open / new untitled.
 */
export const userActiveField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    if (isFullDocReplacement(tr)) return false;
    if (value) return true;
    if (isUserInteraction(tr)) return true;
    return value;
  },
});

export function hasActiveLine(state: EditorState): boolean {
  return state.field(userActiveField, false);
}

export function userActiveExtension(): Extension {
  return userActiveField;
}

function isUserInteraction(tr: Transaction): boolean {
  const ev = tr.annotation(Transaction.userEvent);
  if (ev) {
    if (
      ev.startsWith('input') ||
      ev.startsWith('delete') ||
      ev.startsWith('select')
    ) {
      return true;
    }
  }
  if (tr.selection) return true;
  return false;
}

function isFullDocReplacement(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  const prevLen = tr.startState.doc.length;
  if (prevLen === 0) return false;
  // A user typing "select all + type to replace" also produces a single change
  // covering the whole doc — but that comes with an input/delete userEvent,
  // and we don't want to reset interaction tracking there.
  const ev = tr.annotation(Transaction.userEvent);
  if (ev && (ev.startsWith('input') || ev.startsWith('delete'))) return false;
  let count = 0;
  let covers = false;
  tr.changes.iterChanges((fromA, toA) => {
    count++;
    if (fromA === 0 && toA === prevLen) covers = true;
  });
  return count === 1 && covers;
}
