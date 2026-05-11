import type { EditorView } from '@codemirror/view';

const HEADING_PREFIX = /^(#{1,6}) /;

export function setHeading(view: EditorView, level: number): boolean {
  if (level < 1 || level > 6) return false;
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const match = text.match(HEADING_PREFIX);
  let newText: string;
  if (!match) {
    newText = `${'#'.repeat(level)} ${text}`;
  } else if (match[1]!.length === level) {
    newText = text.slice(match[0].length);
  } else {
    newText = `${'#'.repeat(level)} ${text.slice(match[0].length)}`;
  }
  view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
  return true;
}

/**
 * Strip the leading `#…# ` prefix from the current line (the "Body" choice in
 * the WYSIWYG toolbar's Style dropdown). No-op when the line has no heading
 * prefix so selecting "Body" twice doesn't surprise users.
 */
export function clearHeading(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const match = line.text.match(HEADING_PREFIX);
  if (!match) return false;
  view.dispatch({
    changes: { from: line.from, to: line.from + match[0].length, insert: '' },
  });
  return true;
}
