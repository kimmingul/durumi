import type { EditorView } from '@codemirror/view';

export function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
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

export function toggleWrap(view: EditorView, before: string, after: string = before): boolean {
  if (unwrapIfWrapped(view, before, after)) return true;
  return wrapSelection(view, before, after);
}
