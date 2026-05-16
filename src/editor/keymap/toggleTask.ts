import type { EditorView } from '@codemirror/view';

const TASK_RE = /^([-*+])\s\[([ xX])\]\s/;
const LIST_RE = /^([-*+])\s/;

export function toggleTask(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const taskMatch = TASK_RE.exec(text);
  if (taskMatch && taskMatch[1] !== undefined && taskMatch[2] !== undefined) {
    const isChecked = taskMatch[2].toLowerCase() === 'x';
    const next = isChecked ? '[ ]' : '[x]';
    const offset = taskMatch[1].length + 1;
    view.dispatch({
      changes: { from: line.from + offset, to: line.from + offset + 3, insert: next },
    });
    return true;
  }
  const listMatch = LIST_RE.exec(text);
  if (listMatch && listMatch[1] !== undefined) {
    const offset = listMatch[1].length + 1;
    view.dispatch({
      changes: { from: line.from + offset, to: line.from + offset, insert: '[ ] ' },
    });
    return true;
  }
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: '- [ ] ' },
  });
  return true;
}
