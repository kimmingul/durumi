import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { replaceCellText, markdownToCellText } from '../markdownExt/tableEdit';
import {
  navigateNextCell,
  navigatePrevCell,
  navigateNextRow,
  navigatePrevRow,
} from '../keymap/tableNavigation';

/**
 * Phase 3.1.1 — in-place contentEditable table-cell editing (v0.2.4).
 *
 * --- Architecture ---
 *
 * Each row of a markdown table is rendered as a single `Decoration.replace`
 * with `block: true` and `ignoreEvent: false`. Cells are rendered as
 * `contentEditable` divs with `data-row` / `data-col` / `data-table-from`
 * attributes so DOM-level handlers (input / compositionstart /
 * compositionend / keydown) can route edits + navigation back into the
 * CodeMirror document.
 *
 * --- Active-line invariant deviation ---
 *
 * The historical invariant (CONTRIBUTING.md #1) says: in Live (Typora)
 * mode, no `Decoration.replace` on the caret line. The table widget
 * intentionally deviates from that rule. The widget IS the editing
 * surface — collapsing it back to raw source when the caret enters its
 * range would defeat the entire feature. Tables are unique because they
 * have NO inline markers to hide (the `|` chars are structural, not
 * marker-like punctuation), so the "widget always renders" pattern is
 * safer here than for emphasis, headings, links, etc.
 *
 * This deviation is documented as invariant #11 in CONTRIBUTING.md and
 * MUST NOT be copied to other constructs without separate design review.
 *
 * --- IME (Korean / CJK) composition safety ---
 *
 * Composition events fire on the contentEditable cell. We treat
 * composition as the canonical "user is mid-character" signal:
 *  - `compositionstart` sets `data-composing="true"` on the cell.
 *  - All `input` events while composing are IGNORED — no transaction.
 *  - `compositionend` clears the flag and runs a single sync.
 *
 * This mirrors invariant #1 (IME-safe marker hide) by ensuring the live
 * document mutation never interrupts a composition cycle.
 *
 * --- Source-of-truth ---
 *
 * The markdown text in the EditorState is canonical. After every cell
 * sync the StateField rebuilds — the DOM gets re-derived from the
 * source. `updateDOM` is implemented so simple-text edits preserve the
 * existing DOM nodes (and thus focus + caret), but if the structure
 * changes the widget is recreated and focus is explicitly restored via
 * the `pendingFocusCell` queue.
 */

type Alignment = 'default' | 'left' | 'center' | 'right';

export function parseAlignmentForTest(delimiterLine: string): Alignment[] {
  return parseAlignment(delimiterLine);
}

export function computeColWidthsForTest(rowCells: string[][]): string {
  return computeColWidths(rowCells);
}

function parseAlignment(delimiterLine: string): Alignment[] {
  const trimmed = delimiterLine.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => {
    const t = cell.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return 'default';
  });
}

function computeColWidths(rowCells: string[][]): string {
  if (rowCells.length === 0) return '';
  const cols = rowCells[0].length;
  const longest = new Array<number>(cols).fill(1);
  for (const row of rowCells) {
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? '';
      if (cell.length > longest[i]) longest[i] = Math.max(1, cell.length);
    }
  }
  return longest.map((n) => `minmax(80px, ${n}fr)`).join(' ');
}

/**
 * Focus request queued from outside a render pass. The widget's
 * `updateDOM` / mount path reads this and restores caret state when a
 * matching cell renders.
 */
interface PendingFocus {
  tableFrom: number;
  row: number;
  col: number;
  caretAtEnd: boolean;
}
let pendingFocusCell: PendingFocus | null = null;

function queueFocus(tableFrom: number, row: number, col: number, caretAtEnd = false): void {
  pendingFocusCell = { tableFrom, row, col, caretAtEnd };
}

function tryConsumeFocus(rowEl: HTMLElement, tableFrom: number, row: number): void {
  if (!pendingFocusCell) return;
  if (pendingFocusCell.tableFrom !== tableFrom) return;
  if (pendingFocusCell.row !== row) return;
  const col = pendingFocusCell.col;
  const cell = rowEl.querySelector<HTMLElement>(`[data-col="${col}"]`);
  if (!cell) return;
  const atEnd = pendingFocusCell.caretAtEnd;
  pendingFocusCell = null;
  // Defer to allow CM to finish DOM insertion.
  queueMicrotask(() => focusCell(cell, atEnd));
}

export function focusCell(cell: HTMLElement, caretAtEnd: boolean): void {
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

class TableRowWidget extends WidgetType {
  constructor(
    readonly tableFrom: number,
    readonly tableTo: number,
    readonly row: number,
    readonly cells: string[],
    readonly alignment: Alignment[],
    readonly cols: string,
    readonly kind: 'header' | 'delimiter' | 'body',
  ) {
    super();
  }
  eq(other: TableRowWidget) {
    return (
      other.tableFrom === this.tableFrom &&
      other.tableTo === this.tableTo &&
      other.row === this.row &&
      other.kind === this.kind &&
      other.cols === this.cols &&
      other.cells.length === this.cells.length &&
      other.cells.every((c, i) => c === this.cells[i]) &&
      other.alignment.every((a, i) => a === this.alignment[i])
    );
  }
  toDOM(view: EditorView) {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'cm-table-row cm-table-row-' + this.kind;
    row.style.setProperty('--cm-table-cols', this.cols);
    row.dataset.tableFrom = String(this.tableFrom);
    row.dataset.tableTo = String(this.tableTo);
    row.dataset.row = String(this.row);
    if (this.kind === 'delimiter') {
      for (let i = 0; i < this.alignment.length; i++) {
        const c = document.createElement('div');
        c.className = 'cm-table-cell cm-table-delim';
        row.appendChild(c);
      }
      return row;
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = buildCellElement(this.cells[i], i, this.row, this.tableFrom, this.alignment[i], view);
      row.appendChild(c);
    }
    tryConsumeFocus(row, this.tableFrom, this.row);
    return row;
  }
  updateDOM(dom: HTMLElement, view: EditorView) {
    // Preserve DOM (and thus focus + selection) when the row shape is
    // identical and only cell text changed. If the cell count changed we
    // return false so CM recreates the widget cleanly.
    if (this.kind === 'delimiter') return true;
    const existingCells = dom.querySelectorAll<HTMLElement>('.cm-table-cell');
    if (existingCells.length !== this.cells.length) return false;
    dom.dataset.tableFrom = String(this.tableFrom);
    dom.dataset.tableTo = String(this.tableTo);
    dom.dataset.row = String(this.row);
    dom.style.setProperty('--cm-table-cols', this.cols);
    for (let i = 0; i < this.cells.length; i++) {
      const cell = existingCells[i];
      // Don't trample the cell the user is actively composing in.
      if (cell.dataset.composing === 'true') continue;
      // Don't trample if textContent already matches the source — that
      // covers the common "we just synced this cell" case.
      if (cell.textContent !== this.cells[i]) {
        cell.textContent = this.cells[i];
      }
      cell.dataset.row = String(this.row);
      cell.dataset.col = String(i);
      cell.dataset.tableFrom = String(this.tableFrom);
    }
    tryConsumeFocus(dom, this.tableFrom, this.row);
    // Suppress unused-var: view is part of the contract but unused here.
    void view;
    return true;
  }
  ignoreEvent() {
    // Return TRUE so CodeMirror does NOT process DOM events that happen
    // inside our contentEditable cells. The CM `eventBelongsToEditor`
    // helper walks from event.target to contentDOM and rejects the event
    // if any widget in the chain reports `ignoreEvent: true`. That's what
    // we want — clicks, keydowns, focus, etc. should be handled by our
    // cell-level listeners only. Without this CM's mousedown handler
    // would reset its source selection on every cell click, and Cmd+A
    // would select the whole document instead of just the cell.
    return true;
  }
}

function buildCellElement(
  text: string,
  col: number,
  row: number,
  tableFrom: number,
  alignment: Alignment | undefined,
  view: EditorView,
): HTMLElement {
  const c = document.createElement('div');
  c.setAttribute('role', 'cell');
  c.className = 'cm-table-cell';
  c.contentEditable = 'true';
  // `spellcheck` is left on by default; users can disable per-app.
  c.dataset.row = String(row);
  c.dataset.col = String(col);
  c.dataset.tableFrom = String(tableFrom);
  if (alignment && alignment !== 'default') c.style.textAlign = alignment;
  // Phase 3.1.1 displays cell content as LITERAL text. Inline-syntax
  // rendering (`**bold**` → bold) lands in Phase 3.1.2. Using textContent
  // avoids any HTML injection surface.
  c.textContent = text;

  c.addEventListener('compositionstart', () => {
    c.dataset.composing = 'true';
  });
  c.addEventListener('compositionend', () => {
    delete c.dataset.composing;
    syncCell(view, c);
  });
  c.addEventListener('input', () => {
    if (c.dataset.composing === 'true') return;
    syncCell(view, c);
  });
  c.addEventListener('keydown', (ev) => {
    handleCellKeydown(ev, c, view);
  });
  c.addEventListener('paste', (ev) => {
    // Plain-text paste — strip HTML so the cell can't accidentally accept
    // a fragment of formatted markup that would round-trip into the
    // markdown source as `|` chars or newlines that break the row.
    ev.preventDefault();
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    // Collapse newlines to spaces — a row cannot span multiple lines in GFM.
    const safe = text.replace(/\r?\n/g, ' ');
    document.execCommand('insertText', false, safe);
  });
  return c;
}

function syncCell(view: EditorView, cell: HTMLElement): void {
  const tableFromStr = cell.dataset.tableFrom;
  const row = cell.dataset.row;
  const col = cell.dataset.col;
  if (tableFromStr === undefined || row === undefined || col === undefined) return;
  const tableFrom = Number(tableFromStr);
  const rowIdx = Number(row);
  const colIdx = Number(col);
  // Resolve the live tableTo from the StateField — the table may have
  // grown / shrunk since the widget was rendered.
  const info = lookupTableByFrom(view.state, tableFrom);
  if (!info) return;
  const cellText = cell.textContent ?? '';
  // Queue focus restoration in case the widget rebuilds (it usually does
  // because the source changed). If updateDOM patches in place, the queued
  // focus is consumed harmlessly with caretAtEnd matching the current
  // caret state.
  const caretAtEnd = currentCaretAtEnd(cell);
  queueFocus(tableFrom, rowIdx, colIdx, caretAtEnd);
  replaceCellText(view, info.from, info.to, rowIdx, colIdx, cellText);
}

function currentCaretAtEnd(cell: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const r = sel.getRangeAt(0);
  if (!cell.contains(r.endContainer)) return true;
  const tn = cell.firstChild;
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    return r.endOffset >= (tn as Text).length;
  }
  return true;
}

function handleCellKeydown(ev: KeyboardEvent, cell: HTMLElement, view: EditorView): void {
  // Defence-in-depth: stop ANY key event in a cell from bubbling to the
  // CodeMirror editor root. The cell's DOM lives inside `.cm-content`, so
  // without this stopPropagation, CM's `keymap` (which binds Cmd+A,
  // Cmd+Z, etc.) would intercept every keystroke and operate on the
  // source doc — Cmd+A would select the entire document, Cmd+Z would
  // undo our cell-sync transactions and orphan the DOM, etc. The browser
  // default for typing/editing keys still fires on the contentEditable.
  ev.stopPropagation();
  // Don't hijack keys mid-composition — let the IME finish first. Browsers
  // report `keyCode === 229` for composition keys, but `isComposing` on
  // the event is the spec-correct check (Chrome/Electron both honour it).
  if (ev.isComposing || cell.dataset.composing === 'true') {
    // Tab during composition: flush the in-progress text and navigate.
    if (ev.key === 'Tab') {
      ev.preventDefault();
      delete cell.dataset.composing;
      syncCell(view, cell);
      if (ev.shiftKey) navigatePrevCell(cell, view);
      else navigateNextCell(cell, view);
    }
    return;
  }
  if (ev.key === 'Tab') {
    ev.preventDefault();
    // Ensure any pending text is flushed before we move focus.
    syncCell(view, cell);
    if (ev.shiftKey) navigatePrevCell(cell, view);
    else navigateNextCell(cell, view);
    return;
  }
  if (ev.key === 'Enter') {
    // Plain Enter → same column, next row (Typora-style).
    // Shift+Enter or any modifier → no-op (don't insert newline into
    // markdown — would corrupt the row).
    ev.preventDefault();
    syncCell(view, cell);
    navigateNextRow(cell, view);
    return;
  }
  if (ev.key === 'ArrowDown') {
    // Move to same column, next row if any. If at last row, let the event
    // bubble so the editor handles exit-down naturally — but since we
    // stopPropagation above, the editor won't handle it. We accept that
    // because the cell-internal arrow is the more useful behaviour for
    // Phase 3.1.1; phase 3.2 may extend this with explicit exit-down.
    if (navigateNextRow(cell, view)) {
      ev.preventDefault();
    }
    return;
  }
  if (ev.key === 'ArrowUp') {
    if (navigatePrevRow(cell, view)) {
      ev.preventDefault();
    }
    return;
  }
}

interface TableInfo {
  from: number;
  to: number;
  rowLines: { line: number; from: number; to: number; cells: string[]; kind: 'header' | 'delimiter' | 'body'; logicalRow: number }[];
  alignment: Alignment[];
  cols: string;
}

function splitCells(rowText: string): string[] {
  // Trim leading/trailing whitespace and a single outer pipe each.
  const t = rowText.trim().replace(/^\|/, '').replace(/\|$/, '');
  // Escape-aware split: count preceding backslashes; even = unescaped.
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '|') {
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && t[j] === '\\') {
        bs++;
        j--;
      }
      if (bs % 2 === 0) {
        out.push(markdownToCellText(buf));
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  out.push(markdownToCellText(buf));
  return out;
}

function isInsideFence(node: { node: { parent: { name: string; parent: unknown } | null } }): boolean {
  let p = node.node.parent;
  while (p) {
    if (p.name === 'FencedCode' || p.name === 'CodeBlock') return true;
    p = (p as { parent: { name: string; parent: unknown } | null }).parent;
  }
  return false;
}

const DELIM_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function collectTables(state: EditorState): TableInfo[] {
  const out: TableInfo[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      if (isInsideFence(node)) return;
      const tableFrom = node.from;
      const tableTo = node.to;
      const rowLines: TableInfo['rowLines'] = [];
      const cellsByRow: string[][] = [];
      let alignment: Alignment[] = [];
      let logicalRow = 0;
      const child = node.node.firstChild;
      let c = child;
      while (c) {
        const text = state.sliceDoc(c.from, c.to);
        const looksLikeRow = text.includes('|');
        const looksLikeDelim = DELIM_RE.test(text.trim());
        if (c.name === 'TableHeader' && looksLikeRow) {
          const lineNum = state.doc.lineAt(c.from).number;
          const cells = splitCells(text);
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells, kind: 'header', logicalRow });
          cellsByRow.push(cells);
          logicalRow++;
        } else if (c.name === 'TableDelimiter' && looksLikeDelim) {
          alignment = parseAlignment(text);
          const lineNum = state.doc.lineAt(c.from).number;
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells: [], kind: 'delimiter', logicalRow: -1 });
        } else if (c.name === 'TableRow' && looksLikeRow) {
          const lineNum = state.doc.lineAt(c.from).number;
          const cells = splitCells(text);
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells, kind: 'body', logicalRow });
          cellsByRow.push(cells);
          logicalRow++;
        }
        c = c.nextSibling;
      }
      const cols = computeColWidths(cellsByRow);
      out.push({ from: tableFrom, to: tableTo, rowLines, alignment, cols });
    },
  });
  return out;
}

function lookupTableByFrom(state: EditorState, tableFrom: number): TableInfo | null {
  const tables = collectTables(state);
  for (const t of tables) {
    if (t.from === tableFrom) return t;
  }
  // Fallback: the document may have grown ahead of the widget's cached
  // tableFrom (e.g. another edit elsewhere); try fuzzy match by nearest
  // start. For Phase 3.1.1 we tolerate a small offset because the row
  // location is the load-bearing data.
  for (const t of tables) {
    if (Math.abs(t.from - tableFrom) <= 2) return t;
  }
  return null;
}

function build(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tables = collectTables(state);
  for (const t of tables) {
    for (const r of t.rowLines) {
      // INVARIANT-DEVIATION (table-only): unlike every other block widget
      // we deliberately render even when the caret line intersects the
      // row. The widget is the editing surface; collapsing back to source
      // would break the contenteditable cell. See top-of-file doc and
      // CONTRIBUTING.md #11.
      const widget = new TableRowWidget(
        t.from,
        t.to,
        r.logicalRow,
        r.cells,
        t.alignment,
        t.cols,
        r.kind,
      );
      builder.add(r.from, r.to, Decoration.replace({ widget, block: true }));
    }
  }
  return builder.finish();
}

const tableField = StateField.define<DecorationSet>({
  create(state) {
    return build(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return build(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function tableDecoration(): Extension {
  return [tableField];
}

// Test-only helpers
export const _internalForTest = {
  collectTables,
  splitCells,
  queueFocus,
  consumePendingFocus(): PendingFocus | null {
    const f = pendingFocusCell;
    pendingFocusCell = null;
    return f;
  },
};
