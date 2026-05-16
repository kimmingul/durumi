// Phase 3.1.1 / 3.2 — DOM-level navigation between contentEditable table cells.
//
// These helpers run inside the cell `keydown` handler (see
// `decorations/table.ts::handleCellKeydown`). They are NOT CodeMirror
// keymap entries — when focus is in a `contentEditable` element CM's
// input infrastructure doesn't see the events, so a normal `keymap.of(...)`
// binding wouldn't fire.
//
// Each helper returns `true` if it navigated (caller should preventDefault)
// or `false` if there was nowhere to go (caller may let the event bubble).
//
// Phase 3.2: Tab in the LAST cell of the table now adds a new body row
// below and moves focus to its first cell (Typora-style). The transform
// is dispatched via `addTableRow` so the markdown source is updated
// canonically; the queued focus restore then moves the caret into the
// new row when the widget rebuilds.

import type { EditorView } from '@codemirror/view';

interface CellAddress {
  tableFrom: number;
  row: number;
  col: number;
}

function cellAddr(cell: HTMLElement): CellAddress | null {
  const tableFrom = Number(cell.dataset.tableFrom);
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (!Number.isFinite(tableFrom) || !Number.isFinite(row) || !Number.isFinite(col)) {
    return null;
  }
  return { tableFrom, row, col };
}

function findCell(
  view: EditorView,
  tableFrom: number,
  row: number,
  col: number,
): HTMLElement | null {
  const root = view.contentDOM;
  // We can't use [contentEditable=true] because nested ones don't reliably
  // resolve in jsdom; query by the data attrs which are always set.
  const sel = `[data-table-from="${tableFrom}"][data-row="${row}"][data-col="${col}"]`;
  return root.querySelector<HTMLElement>(sel);
}

function cellsInRow(view: EditorView, tableFrom: number, row: number): HTMLElement[] {
  const root = view.contentDOM;
  const sel = `[data-table-from="${tableFrom}"][data-row="${row}"][data-col]`;
  return Array.from(root.querySelectorAll<HTMLElement>(sel));
}

function maxRow(view: EditorView, tableFrom: number): number {
  const root = view.contentDOM;
  const sel = `[data-table-from="${tableFrom}"][data-col="0"]`;
  const cells = root.querySelectorAll<HTMLElement>(sel);
  let max = -1;
  cells.forEach((el) => {
    const r = Number(el.dataset.row);
    if (Number.isFinite(r) && r > max) max = r;
  });
  return max;
}

function focusCell(cell: HTMLElement, caretAtEnd = false): void {
  cell.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (cell.firstChild && cell.firstChild.nodeType === Node.TEXT_NODE) {
    const tn = cell.firstChild as Text;
    const offset = caretAtEnd ? tn.length : 0;
    range.setStart(tn, offset);
    range.setEnd(tn, offset);
  } else {
    range.selectNodeContents(cell);
    range.collapse(!caretAtEnd);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function navigateNextCell(cell: HTMLElement, view: EditorView): boolean {
  const addr = cellAddr(cell);
  if (!addr) return false;
  // Try same row, next col.
  const sameRow = cellsInRow(view, addr.tableFrom, addr.row);
  if (addr.col + 1 < sameRow.length) {
    const next = findCell(view, addr.tableFrom, addr.row, addr.col + 1);
    if (next) {
      focusCell(next, false);
      return true;
    }
  }
  // Next row, col 0.
  const nextRowCells = cellsInRow(view, addr.tableFrom, addr.row + 1);
  if (nextRowCells.length > 0 && nextRowCells[0]) {
    focusCell(nextRowCells[0], false);
    return true;
  }
  // Last cell of table — Phase 3.1.1 explicitly no-ops here.
  return false;
}

export function navigatePrevCell(cell: HTMLElement, view: EditorView): boolean {
  const addr = cellAddr(cell);
  if (!addr) return false;
  if (addr.col > 0) {
    const prev = findCell(view, addr.tableFrom, addr.row, addr.col - 1);
    if (prev) {
      focusCell(prev, true);
      return true;
    }
  }
  if (addr.row > 0) {
    const prevRowCells = cellsInRow(view, addr.tableFrom, addr.row - 1);
    if (prevRowCells.length > 0) {
      const last = prevRowCells[prevRowCells.length - 1];
      if (last) {
        focusCell(last, true);
        return true;
      }
    }
  }
  return false;
}

export function navigateNextRow(cell: HTMLElement, view: EditorView): boolean {
  const addr = cellAddr(cell);
  if (!addr) return false;
  const last = maxRow(view, addr.tableFrom);
  if (addr.row >= last) return false;
  const next = findCell(view, addr.tableFrom, addr.row + 1, addr.col);
  if (!next) return false;
  focusCell(next, true);
  return true;
}

export function navigatePrevRow(cell: HTMLElement, view: EditorView): boolean {
  const addr = cellAddr(cell);
  if (!addr) return false;
  if (addr.row <= 0) return false;
  const prev = findCell(view, addr.tableFrom, addr.row - 1, addr.col);
  if (!prev) return false;
  focusCell(prev, true);
  return true;
}
