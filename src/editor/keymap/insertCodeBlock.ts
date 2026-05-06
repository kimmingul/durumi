import type { EditorView } from '@codemirror/view';

export function insertCodeBlock(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    const insert = '\n```\n\n```\n';
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 5 },
    });
    return true;
  }
  const sel = view.state.sliceDoc(from, to);
  const insert = '```text\n' + sel + '\n```';
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 3, head: from + 7 },
  });
  return true;
}
