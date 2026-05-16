import { EditorView, KeyBinding } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const TASK_RE = /^(\s*)([-*+])\s+\[[ xX]\]\s+(.*)$/;

/**
 * Enter on a markdown list item starts the next item with the same marker
 * (and bumps the number for ordered lists). Pressing Enter on an empty list
 * item exits the list (removes the marker and stays on the line).
 */
export function enterListContinuation(): KeyBinding {
  return {
    key: 'Enter',
    run(view) {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty) return false;
      const line = state.doc.lineAt(sel.head);
      if (sel.head !== line.to) return false;
      const text = line.text;

      const taskMatch = text.match(TASK_RE);
      if (taskMatch) {
        return continueOrExit(
          view,
          line.from,
          line.to,
          taskMatch[1] ?? '',
          `${taskMatch[2] ?? ''} [ ] `,
          taskMatch[3] ?? '',
        );
      }

      const bulletMatch = text.match(BULLET_RE);
      if (bulletMatch) {
        return continueOrExit(
          view,
          line.from,
          line.to,
          bulletMatch[1] ?? '',
          `${bulletMatch[2] ?? ''} `,
          bulletMatch[3] ?? '',
        );
      }

      const orderedMatch = text.match(ORDERED_RE);
      if (orderedMatch) {
        const next = String(Number(orderedMatch[2] ?? '0') + 1);
        return continueOrExit(
          view,
          line.from,
          line.to,
          orderedMatch[1] ?? '',
          `${next}${orderedMatch[3] ?? ''} `,
          orderedMatch[4] ?? '',
        );
      }

      return false;
    },
  };
}

function continueOrExit(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  indent: string,
  marker: string,
  rest: string,
): boolean {
  if (rest.trim().length === 0) {
    view.dispatch({
      changes: { from: lineFrom, to: lineTo, insert: '' },
      selection: EditorSelection.cursor(lineFrom),
    });
    return true;
  }
  const insert = `\n${indent}${marker}`;
  view.dispatch({
    changes: { from: lineTo, to: lineTo, insert },
    selection: EditorSelection.cursor(lineTo + insert.length),
    scrollIntoView: true,
  });
  return true;
}
