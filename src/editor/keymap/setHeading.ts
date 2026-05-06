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
