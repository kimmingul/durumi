import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertTable } from '../../src/editor/keymap/insertTable';

function viewWith(doc: string, anchor: number, head = anchor): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
  });
}

describe('insertTable with explicit rows/cols', () => {
  it('inserts a 3x3 table with three header columns and two data rows', () => {
    const view = viewWith('', 0);
    insertTable(view, 3, 3);
    const out = view.state.doc.toString();
    const lines = out.split('\n');
    // Header + separator + 2 data rows + trailing blank = 5
    expect(lines[0]).toMatch(/^\| Header 1 +\| Header 2 +\| Header 3 +\|$/);
    expect(lines[1]).toMatch(/^\| -+ \| -+ \| -+ \|$/);
    expect(lines[2]).toMatch(/^\| Cell 1 +\| Cell 2 +\| Cell 3 +\|$/);
    expect(lines[3]).toMatch(/^\| Cell 4 +\| Cell 5 +\| Cell 6 +\|$/);
    view.destroy();
  });

  it('clamps rows<2 to 2 and cols<1 to 1', () => {
    const view = viewWith('', 0);
    insertTable(view, 1, 0);
    const out = view.state.doc.toString();
    expect(out).toContain('| Header 1 |');
    // Exactly two body lines after header: separator + one data row.
    expect(out.split('\n').filter((l) => l.length > 0)).toHaveLength(3);
    view.destroy();
  });

  it('preserves legacy 2x2 default when args are omitted', () => {
    const view = viewWith('', 0);
    insertTable(view);
    expect(view.state.doc.toString()).toBe(
      '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n',
    );
    view.destroy();
  });
});
