import type { EditorView } from '@codemirror/view';

const HEADING_PREFIX = /^(#{1,6}) /;
// v0.1.12 — escaped form: `\#`, `\##`, …, optionally followed by space.
// Each `#` is preceded by its own `\` because the WYSIWYG escape filter
// escapes each character independently as the user types.
const ESCAPED_HEADING_PREFIX = /^((?:\\#){1,6}) ?/;

function stripHeadingPrefix(text: string): string {
  const raw = text.match(HEADING_PREFIX);
  if (raw) return text.slice(raw[0].length);
  const escaped = text.match(ESCAPED_HEADING_PREFIX);
  if (escaped) return text.slice(escaped[0].length);
  return text;
}

function currentHeadingLevel(text: string): number {
  const raw = text.match(HEADING_PREFIX);
  if (raw) return raw[1]!.length;
  const escaped = text.match(ESCAPED_HEADING_PREFIX);
  if (escaped) return escaped[1]!.length / 2; // `\#` is two chars per level
  return 0;
}

export function setHeading(view: EditorView, level: number): boolean {
  if (level < 1 || level > 6) return false;
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const stripped = stripHeadingPrefix(text);
  const newText = currentHeadingLevel(text) === level
    ? stripped
    : `${'#'.repeat(level)} ${stripped}`;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
  return true;
}

/**
 * Strip the leading `#…# ` (or `\#…\# ` WYSIWYG-escaped) prefix from the
 * current line — the "Body" choice in the WYSIWYG toolbar's Style dropdown.
 * No-op when the line has no heading prefix.
 */
export function clearHeading(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const stripped = stripHeadingPrefix(line.text);
  if (stripped === line.text) return false;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: stripped } });
  return true;
}
