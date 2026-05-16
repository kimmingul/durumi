import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

function findCellAt(view: EditorView, pos: number): SyntaxNode | null {
  const tree = syntaxTree(view.state);
  for (const side of [0, -1, 1] as const) {
    let cur: SyntaxNode | null = tree.resolveInner(pos, side);
    while (cur) {
      if (cur.name === 'TableCell') return cur;
      if (cur.name === 'Table') break;
      cur = cur.parent;
    }
  }
  return null;
}

function findRowAt(view: EditorView, pos: number): SyntaxNode | null {
  const tree = syntaxTree(view.state);
  for (const side of [0, -1, 1] as const) {
    let cur: SyntaxNode | null = tree.resolveInner(pos, side);
    while (cur) {
      if (cur.name === 'TableRow' || cur.name === 'TableHeader') return cur;
      if (cur.name === 'Document') break;
      cur = cur.parent;
    }
  }
  return null;
}

function findTableAt(view: EditorView, pos: number): SyntaxNode | null {
  const tree = syntaxTree(view.state);
  for (const side of [0, -1, 1] as const) {
    let cur: SyntaxNode | null = tree.resolveInner(pos, side);
    while (cur) {
      if (cur.name === 'Table') return cur;
      if (cur.name === 'Document') break;
      cur = cur.parent;
    }
  }
  return null;
}

function rowCells(row: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  let c = row.firstChild;
  while (c) {
    if (c.name === 'TableCell') out.push(c);
    c = c.nextSibling;
  }
  return out;
}

export function tableNextCell(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const cell = findCellAt(view, head);
  if (!cell) return false;
  const row = findRowAt(view, head);
  if (!row) return false;
  const cells = rowCells(row);
  const idx = cells.findIndex((c) => c.from === cell.from);
  if (idx < cells.length - 1) {
    const nextCell = cells[idx + 1];
    if (!nextCell) return false;
    view.dispatch({ selection: { anchor: nextCell.from } });
    return true;
  }
  const table = findTableAt(view, head);
  if (!table) return false;
  let next: SyntaxNode | null = row.nextSibling;
  while (next && next.name !== 'TableRow' && next.name !== 'TableHeader') {
    next = next.nextSibling;
  }
  if (next) {
    const c0 = rowCells(next)[0];
    if (c0) {
      view.dispatch({ selection: { anchor: c0.from } });
      return true;
    }
  }
  const cols = cells.length;
  const blank = '|' + '     |'.repeat(cols);
  const tableLine = view.state.doc.lineAt(table.to);
  const insertPos = tableLine.to;
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: '\n' + blank },
    selection: { anchor: insertPos + 2 },
  });
  return true;
}

export function tablePrevCell(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const cell = findCellAt(view, head);
  if (!cell) return false;
  const row = findRowAt(view, head);
  if (!row) return false;
  const cells = rowCells(row);
  const idx = cells.findIndex((c) => c.from === cell.from);
  if (idx > 0) {
    const prevCell = cells[idx - 1];
    if (!prevCell) return false;
    view.dispatch({ selection: { anchor: prevCell.from } });
    return true;
  }
  const table = findTableAt(view, head);
  if (!table) return false;
  const lineAbove = view.state.doc.lineAt(table.from).number - 1;
  if (lineAbove < 1) {
    view.dispatch({
      changes: { from: 0, to: 0, insert: '\n' },
      selection: { anchor: 0 },
    });
    return true;
  }
  const target = view.state.doc.line(lineAbove);
  view.dispatch({ selection: { anchor: target.to } });
  return true;
}

export function tableExitDown(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const cell = findCellAt(view, head);
  if (!cell) return false;
  const table = findTableAt(view, head);
  if (!table) return false;
  const lastLine = view.state.doc.lineAt(table.to);
  const nextLineNum = lastLine.number + 1;
  if (nextLineNum > view.state.doc.lines) {
    view.dispatch({
      changes: { from: lastLine.to, to: lastLine.to, insert: '\n' },
      selection: { anchor: lastLine.to + 1 },
    });
    return true;
  }
  const next = view.state.doc.line(nextLineNum);
  if (next.text.trim().length > 0) {
    view.dispatch({
      changes: { from: lastLine.to, to: lastLine.to, insert: '\n' },
      selection: { anchor: lastLine.to + 1 },
    });
    return true;
  }
  view.dispatch({ selection: { anchor: next.from } });
  return true;
}

export function tableInsertRowBelow(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const cell = findCellAt(view, head);
  if (!cell) return false;
  const row = findRowAt(view, head);
  if (!row) return false;
  const cells = rowCells(row);
  const cols = cells.length;
  const blank = '|' + '     |'.repeat(cols);
  const lineEnd = view.state.doc.lineAt(row.to).to;
  view.dispatch({
    changes: { from: lineEnd, to: lineEnd, insert: '\n' + blank },
    selection: { anchor: lineEnd + 2 },
  });
  return true;
}
