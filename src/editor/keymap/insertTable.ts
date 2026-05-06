import type { EditorView } from '@codemirror/view';

const BOILERPLATE = '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n';
const HEADER_OFFSET = 2; // skip "| " in the first row
const HEADER_LEN = 'Header 1'.length;

export function insertTable(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: BOILERPLATE },
    selection: { anchor: from + HEADER_OFFSET, head: from + HEADER_OFFSET + HEADER_LEN },
  });
  return true;
}
