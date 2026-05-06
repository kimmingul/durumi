import type { EditorState } from '@codemirror/state';

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
