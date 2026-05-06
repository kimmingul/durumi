import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { jumpToLine } from '../../src/editor/jumpToLine';

function makeView(doc: string): EditorView {
  return new EditorView({
    state: EditorState.create({ doc }),
    parent: document.body,
  });
}

describe('jumpToLine', () => {
  it('moves the cursor to the given line start', () => {
    const view = makeView('line 1\nline 2\nline 3');
    jumpToLine(view, 3);
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(line.number).toBe(3);
    expect(head).toBe(line.from);
    view.destroy();
  });

  it('focuses the view', () => {
    const view = makeView('a\nb');
    const focusSpy = vi.spyOn(view, 'focus');
    jumpToLine(view, 1);
    expect(focusSpy).toHaveBeenCalled();
    view.destroy();
  });

  it('handles line 1', () => {
    const view = makeView('first');
    jumpToLine(view, 1);
    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });
});
