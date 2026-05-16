import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { taskListDecoration } from '../../src/editor/decorations/taskList';

function makeView(doc: string, cursor: number): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), taskListDecoration()],
    }),
    parent: document.body,
  });
}

function readWidgets(view: EditorView): HTMLInputElement[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLInputElement>('input.cm-task-checkbox'));
}

describe('taskList decoration', () => {
  it('renders unchecked checkbox for "- [ ] foo" on inactive line', () => {
    const doc = '- [ ] foo\nnext';
    const view = makeView(doc, doc.length);
    const boxes = readWidgets(view);
    expect(boxes.length).toBe(1);
    expect(boxes[0]!.checked).toBe(false);
    view.destroy();
  });

  it('renders checked checkbox for "- [x] foo" on inactive line', () => {
    const doc = '- [x] foo\nnext';
    const view = makeView(doc, doc.length);
    const boxes = readWidgets(view);
    expect(boxes.length).toBe(1);
    expect(boxes[0]!.checked).toBe(true);
    view.destroy();
  });

  it('renders no checkbox when line is active', () => {
    const doc = '- [ ] foo';
    const view = makeView(doc, 6);
    expect(readWidgets(view).length).toBe(0);
    view.destroy();
  });

  it('mousedown on checkbox dispatches [ ] -> [x] transaction', () => {
    const doc = '- [ ] foo\nnext';
    const view = makeView(doc, doc.length);
    const box = readWidgets(view)[0]!;
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    box.dispatchEvent(ev);
    expect(view.state.doc.toString()).toBe('- [x] foo\nnext');
    view.destroy();
  });

  it('mousedown on checked checkbox dispatches [x] -> [ ] transaction', () => {
    const doc = '- [x] foo\nnext';
    const view = makeView(doc, doc.length);
    const box = readWidgets(view)[0]!;
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe('- [ ] foo\nnext');
    view.destroy();
  });
});
