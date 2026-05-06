import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { tableNextCell, tablePrevCell, tableExitDown, tableInsertRowBelow } from '../../src/editor/keymap/table';

const SAMPLE = '| H1 | H2 |\n| --- | --- |\n| a | b |\n';

function viewAt(cursor: number, doc = SAMPLE): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
    }),
  });
}

describe('tableNextCell', () => {
  it('jumps from cell 1 to cell 2 inside the same row', () => {
    const view = viewAt(SAMPLE.indexOf('H1') + 1);
    const handled = tableNextCell(view);
    expect(handled).toBe(true);
    const head = view.state.selection.main.head;
    const slice = view.state.sliceDoc(head, head + 2);
    expect(slice).toBe('H2');
    view.destroy();
  });

  it('returns false when cursor is outside any TableCell', () => {
    const view = viewAt(0, 'plain\n');
    expect(tableNextCell(view)).toBe(false);
    view.destroy();
  });

  it('adds a new row when Tab is pressed in the last cell', () => {
    const view = viewAt(SAMPLE.indexOf('b') + 1);
    const handled = tableNextCell(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(SAMPLE + '|     |     |\n');
    view.destroy();
  });
});

describe('tablePrevCell', () => {
  it('jumps from cell 2 to cell 1', () => {
    const view = viewAt(SAMPLE.indexOf('H2') + 1);
    expect(tablePrevCell(view)).toBe(true);
    const head = view.state.selection.main.head;
    expect(view.state.sliceDoc(head, head + 2)).toBe('H1');
    view.destroy();
  });
});

describe('tableExitDown', () => {
  it('moves cursor to the line just after the table, inserting one if absent', () => {
    const view = viewAt(SAMPLE.indexOf('a') + 1);
    expect(tableExitDown(view)).toBe(true);
    const head = view.state.selection.main.head;
    const lineNum = view.state.doc.lineAt(head).number;
    expect(lineNum).toBe(4);
    view.destroy();
  });
});

describe('tableInsertRowBelow', () => {
  it('inserts a blank row after the current row and moves to its first cell', () => {
    const view = viewAt(SAMPLE.indexOf('H1') + 1);
    expect(tableInsertRowBelow(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      '| H1 | H2 |\n|     |     |\n| --- | --- |\n| a | b |\n',
    );
    view.destroy();
  });
});
