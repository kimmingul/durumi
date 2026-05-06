import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertTable } from '../../src/editor/keymap/insertTable';
import { insertCodeBlock } from '../../src/editor/keymap/insertCodeBlock';
import { toggleTask } from '../../src/editor/keymap/toggleTask';

function viewWith(doc: string, anchor: number, head = anchor): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
  });
}

describe('insertTable', () => {
  it('inserts 2x2 boilerplate and selects "Header 1"', () => {
    const view = viewWith('', 0);
    insertTable(view);
    expect(view.state.doc.toString()).toBe(
      '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n',
    );
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('Header 1');
    view.destroy();
  });
});

describe('insertCodeBlock', () => {
  it('inserts empty fenced block at cursor when selection empty', () => {
    const view = viewWith('hello', 5);
    insertCodeBlock(view);
    expect(view.state.doc.toString()).toBe('hello\n```\n\n```\n');
    const cur = view.state.selection.main.head;
    expect(view.state.doc.lineAt(cur).number).toBe(3);
    view.destroy();
  });

  it('wraps selection in fenced block with "text" lang placeholder selected', () => {
    const view = viewWith('foo bar baz', 4, 7); // "bar"
    insertCodeBlock(view);
    expect(view.state.doc.toString()).toBe('foo ```text\nbar\n``` baz');
    const sel = view.state.selection.main;
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe('text');
    view.destroy();
  });
});

describe('toggleTask', () => {
  it('converts "- foo" to "- [ ] foo"', () => {
    const view = viewWith('- foo', 5);
    toggleTask(view);
    expect(view.state.doc.toString()).toBe('- [ ] foo');
    view.destroy();
  });

  it('toggles "- [ ] foo" to "- [x] foo"', () => {
    const view = viewWith('- [ ] foo', 5);
    toggleTask(view);
    expect(view.state.doc.toString()).toBe('- [x] foo');
    view.destroy();
  });

  it('toggles "- [x] foo" back to "- [ ] foo"', () => {
    const view = viewWith('- [x] foo', 5);
    toggleTask(view);
    expect(view.state.doc.toString()).toBe('- [ ] foo');
    view.destroy();
  });

  it('prepends "- [ ] " to a non-list line', () => {
    const view = viewWith('plain', 3);
    toggleTask(view);
    expect(view.state.doc.toString()).toBe('- [ ] plain');
    view.destroy();
  });
});
