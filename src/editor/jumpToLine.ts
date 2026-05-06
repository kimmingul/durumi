import { EditorView } from '@codemirror/view';

export function jumpToLine(view: EditorView, line: number): void {
  const lineObj = view.state.doc.line(line);
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: 'start', yMargin: 16 }),
  });
  view.focus();
}
