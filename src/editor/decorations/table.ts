import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { replaceCellText, markdownToCellText } from '../markdownExt/tableEdit';
import { renderInlineMarksToDom } from '../markdownExt/inlineMarkdownRenderer';
import {
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
} from '../markdownExt/tableTransform';
import {
  navigateNextCell,
  navigatePrevCell,
  navigateNextRow,
  navigatePrevRow,
} from '../keymap/tableNavigation';
import { t } from '../../i18n/t';
import { resolveTableStyle } from '../markdownExt/tableStylePlugin';
import {
  styleToCssVars,
  type TableStyle,
  type TableStyleSerialized,
} from '../../../shared/tableStyle';
import { openTableStylePopover } from '../../components/tableStylePopoverHost';

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
  const cols = rowCells[0]?.length ?? 0;
  const longest = new Array<number>(cols).fill(1);
  for (const row of rowCells) {
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? '';
      if (cell.length > (longest[i] ?? 0)) longest[i] = Math.max(1, cell.length);
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
  // Phase 3.1.2: programmatic focus must first switch the cell into raw
  // mode so the caret-placement logic below operates on a real text node.
  // The `focus` DOM event listener will do this, but we run it eagerly
  // so the range we set isn't immediately discarded by the listener's
  // own setCellText() swap.
  if (cell.dataset.cellMode !== 'raw') {
    cell.dataset.cellMode = 'raw';
    setCellText(cell, cell.dataset.cellText ?? '');
  }
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

/* --------------------------------------------------------------------
 * Phase 3.2 — floating cell-action toolbar.
 *
 * On `mouseenter` of a cell (after a small ~150ms delay) we attach an
 * overlay element with six action buttons. The overlay is a child of
 * the cell itself so it shares the cell's hover scope — moving the
 * mouse from the cell into a button does NOT fire `mouseleave` on the
 * cell.
 *
 * Button clicks transform the table source via the helpers in
 * `tableTransform.ts`, dispatch a CM transaction, and queue a focus
 * target so the rebuilt widget restores the caret to a sensible cell.
 * ------------------------------------------------------------------ */

type CellAction =
  | 'rowAbove'
  | 'rowBelow'
  | 'colLeft'
  | 'colRight'
  | 'rowDelete'
  | 'colDelete';

const HOVER_DELAY_MS = 150;

function makeSvg(paths: string[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const ACTION_ICONS: Record<CellAction, () => SVGSVGElement> = {
  rowAbove: () => makeSvg(['M12 4v10', 'M8 8l4-4 4 4', 'M4 18h16']),
  rowBelow: () => makeSvg(['M4 6h16', 'M12 10v10', 'M8 16l4 4 4-4']),
  colLeft: () => makeSvg(['M18 4v16', 'M10 12H4', 'M8 8l-4 4 4 4']),
  colRight: () => makeSvg(['M6 4v16', 'M14 12h6', 'M16 8l4 4-4 4']),
  rowDelete: () => makeSvg(['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6']),
  colDelete: () => makeSvg(['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6']),
};

const ACTION_TESTID: Record<CellAction, string> = {
  rowAbove: 'table-action-row-above',
  rowBelow: 'table-action-row-below',
  colLeft: 'table-action-col-left',
  colRight: 'table-action-col-right',
  rowDelete: 'table-action-row-delete',
  colDelete: 'table-action-col-delete',
};

const ACTION_I18N: Record<CellAction, string> = {
  rowAbove: 'table.action.rowAbove',
  rowBelow: 'table.action.rowBelow',
  colLeft: 'table.action.colLeft',
  colRight: 'table.action.colRight',
  rowDelete: 'table.action.rowDelete',
  colDelete: 'table.action.colDelete',
};

const ACTION_CLASS: Record<CellAction, string> = {
  rowAbove: 'cm-table-action-row-above',
  rowBelow: 'cm-table-action-row-below',
  colLeft: 'cm-table-action-col-left',
  colRight: 'cm-table-action-col-right',
  rowDelete: 'cm-table-action-row-delete',
  colDelete: 'cm-table-action-col-delete',
};

interface CellActionContext {
  view: EditorView;
  tableFrom: number;
  row: number;
  col: number;
}

function dispatchCellAction(ctx: CellActionContext, action: CellAction): void {
  const info = lookupTableByFrom(ctx.view.state, ctx.tableFrom);
  if (!info) return;
  const src = ctx.view.state.sliceDoc(info.from, info.to);
  // Count rows + cols from the live info.
  const bodyCount = info.rowLines.filter((r) => r.kind === 'body').length;
  const colCount = info.alignment.length || (info.rowLines.find((r) => r.kind === 'header')?.cells.length ?? 1);
  let next: string | null = null;
  let focusRow = ctx.row;
  let focusCol = ctx.col;
  switch (action) {
    case 'rowAbove': {
      if (ctx.row === 0) return;
      next = addTableRow(src, ctx.row, 'above');
      focusRow = ctx.row;
      break;
    }
    case 'rowBelow': {
      next = addTableRow(src, ctx.row, 'below');
      focusRow = ctx.row + 1;
      break;
    }
    case 'colLeft': {
      next = addTableColumn(src, ctx.col, 'left');
      focusCol = ctx.col;
      break;
    }
    case 'colRight': {
      next = addTableColumn(src, ctx.col, 'right');
      focusCol = ctx.col + 1;
      break;
    }
    case 'rowDelete': {
      if (ctx.row === 0) return;
      if (bodyCount <= 0) return;
      next = removeTableRow(src, ctx.row);
      // Focus the row above the deleted one (or stay at row 1 if deleting
      // the first body row — that becomes the new row 1).
      if (bodyCount === 1) {
        // Deleted the last body row — focus the header.
        focusRow = 0;
      } else {
        focusRow = Math.max(1, ctx.row - 1);
        // If we deleted row 1 of a multi-body table, focus stays on the
        // (new) row 1 (formerly row 2). Use min/max to clamp.
        if (ctx.row === 1) focusRow = 1;
        // If we deleted the last body row, focus the new last row.
        if (ctx.row === bodyCount) focusRow = bodyCount - 1;
      }
      break;
    }
    case 'colDelete': {
      if (colCount <= 1) return;
      next = removeTableColumn(src, ctx.col);
      focusCol = Math.max(0, ctx.col - 1);
      if (ctx.col === 0) focusCol = 0;
      if (ctx.col >= colCount - 1) focusCol = colCount - 2;
      break;
    }
  }
  if (next === null || next === src) return;
  queueFocus(ctx.tableFrom, focusRow, focusCol, false);
  ctx.view.dispatch({
    changes: { from: info.from, to: info.to, insert: next },
    userEvent: 'input.tableTransform',
  });
}

/**
 * Phase 3.2: when Tab is pressed in the very last cell of the table
 * (no more cells to navigate to), insert a new body row below and
 * move focus to its first cell. Uses the markdown-source transform so
 * the new row appears canonical (same column count, proper padding).
 */
function addRowOnTabOverflow(cell: HTMLElement, view: EditorView): void {
  const tableFromStr = cell.dataset.tableFrom;
  const rowStr = cell.dataset.row;
  if (tableFromStr === undefined || rowStr === undefined) return;
  const tableFrom = Number(tableFromStr);
  const row = Number(rowStr);
  const info = lookupTableByFrom(view.state, tableFrom);
  if (!info) return;
  const src = view.state.sliceDoc(info.from, info.to);
  const next = addTableRow(src, row, 'below');
  if (next === src) return;
  // The new row becomes row+1; focus its first cell.
  queueFocus(tableFrom, row + 1, 0, false);
  view.dispatch({
    changes: { from: info.from, to: info.to, insert: next },
    userEvent: 'input.tableTransform',
  });
}

function getCellHoverContext(cell: HTMLElement): { tableFrom: number; row: number; col: number } | null {
  const tableFromStr = cell.dataset.tableFrom;
  const row = cell.dataset.row;
  const col = cell.dataset.col;
  if (tableFromStr === undefined || row === undefined || col === undefined) return null;
  return {
    tableFrom: Number(tableFromStr),
    row: Number(row),
    col: Number(col),
  };
}

function buildActionButton(
  action: CellAction,
  ctx: CellActionContext,
  enabled: boolean,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.testid = ACTION_TESTID[action];
  btn.setAttribute('data-testid', ACTION_TESTID[action]);
  const label = t(ACTION_I18N[action]);
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.disabled = !enabled;
  btn.className =
    'cm-table-action-btn ' + ACTION_CLASS[action] + (enabled ? '' : ' cm-table-action-btn-disabled');
  btn.appendChild(ACTION_ICONS[action]());
  // Prevent blur on mousedown so focus state survives the click handler.
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!enabled) return;
    dispatchCellAction(ctx, action);
  });
  return btn;
}

function attachCellHoverOverlay(cell: HTMLElement, view: EditorView): void {
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let overlay: HTMLDivElement | null = null;
  // Track which areas the mouse is currently over so we can keep the
  // overlay visible while moving from cell to a button that lives
  // *outside* the cell's bounding rect (e.g. col-left, which is at
  // `left: -16px`). Without this, the cell `mouseleave` would fire as
  // soon as the cursor crosses the cell edge into the button, and the
  // overlay would disappear before the click landed.
  let inCell = false;
  let inOverlay = false;

  const clearShowTimer = (): void => {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  };
  const clearHideTimer = (): void => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const removeOverlay = (): void => {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  };

  const scheduleHide = (): void => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      if (!inCell && !inOverlay) removeOverlay();
    }, 80);
  };

  const showOverlay = (): void => {
    if (overlay) return;
    const ctx = getCellHoverContext(cell);
    if (!ctx) return;
    const info = lookupTableByFrom(view.state, ctx.tableFrom);
    if (!info) return;
    const bodyCount = info.rowLines.filter((r) => r.kind === 'body').length;
    const colCount =
      info.alignment.length || (info.rowLines.find((r) => r.kind === 'header')?.cells.length ?? 1);
    const fullCtx: CellActionContext = { view, ...ctx };
    const canRemoveRow = ctx.row > 0 && bodyCount > 0;
    const canRemoveCol = colCount > 1;
    const canAddRowAbove = ctx.row > 0;
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-cell-actions-anchor';
    wrap.style.position = 'absolute';
    wrap.style.inset = '0';
    wrap.style.pointerEvents = 'none';
    const grp = document.createElement('div');
    grp.className = 'cm-table-cell-actions';
    grp.setAttribute('role', 'group');
    grp.setAttribute('aria-label', 'Table cell actions');
    grp.appendChild(buildActionButton('rowAbove', fullCtx, canAddRowAbove));
    grp.appendChild(buildActionButton('rowBelow', fullCtx, true));
    grp.appendChild(buildActionButton('colLeft', fullCtx, true));
    grp.appendChild(buildActionButton('colRight', fullCtx, true));
    grp.appendChild(buildActionButton('rowDelete', fullCtx, canRemoveRow));
    grp.appendChild(buildActionButton('colDelete', fullCtx, canRemoveCol));
    // Track hover on the overlay so a button positioned outside the
    // cell rect doesn't trigger a leave + reappear flicker.
    grp.addEventListener('mouseenter', () => {
      inOverlay = true;
      clearHideTimer();
    });
    grp.addEventListener('mouseleave', () => {
      inOverlay = false;
      scheduleHide();
    });
    wrap.appendChild(grp);
    overlay = wrap;
    const prevPos = cell.style.position;
    if (!prevPos) cell.style.position = 'relative';
    cell.appendChild(wrap);
  };

  cell.addEventListener('mouseenter', () => {
    inCell = true;
    clearHideTimer();
    if (overlay) return;
    if (showTimer === null) {
      showTimer = setTimeout(showOverlay, HOVER_DELAY_MS);
    }
  });
  cell.addEventListener('mouseleave', () => {
    inCell = false;
    clearShowTimer();
    scheduleHide();
  });
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
    readonly styleMeta: TableStyleSerialized,
    readonly isFirstRow: boolean,
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
      other.alignment.every((a, i) => a === this.alignment[i]) &&
      other.isFirstRow === this.isFirstRow &&
      tableStyleMetaEquals(other.styleMeta, this.styleMeta)
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
    applyStyleVars(row, this.styleMeta.style);
    if (this.styleMeta.source !== 'none') {
      row.dataset.tableStyleSource = this.styleMeta.source;
    }
    if (this.kind === 'delimiter') {
      for (let i = 0; i < this.alignment.length; i++) {
        const c = document.createElement('div');
        c.className = 'cm-table-cell cm-table-delim';
        row.appendChild(c);
      }
      return row;
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = buildCellElement(
        this.cells[i] ?? '',
        i,
        this.row,
        this.tableFrom,
        this.alignment[i],
        view,
      );
      row.appendChild(c);
    }
    if (this.isFirstRow) {
      row.appendChild(buildTableStyleGear(view, this.tableFrom));
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
    applyStyleVars(dom, this.styleMeta.style);
    if (this.styleMeta.source !== 'none') {
      dom.dataset.tableStyleSource = this.styleMeta.source;
    } else {
      delete dom.dataset.tableStyleSource;
    }
    for (let i = 0; i < this.cells.length; i++) {
      const cell = existingCells[i];
      if (!cell) continue;
      const incoming = this.cells[i] ?? '';
      // Don't trample the cell the user is actively composing in.
      if (cell.dataset.composing === 'true') continue;
      // Read the cell's logical text. In raw mode this returns the live
      // DOM text; in rendered mode the cached `dataset.cellText`.
      const textNow = cellTextOnly(cell);
      if (textNow !== incoming) {
        // The source changed externally (or our own dispatch round-tripped).
        // If the cell is currently focused in raw mode, just update the
        // cached source without rebuilding the DOM — the user's caret +
        // selection must survive. The `input` listener already keeps the
        // doc in sync with their typing; if our incoming `this.cells[i]`
        // differs from the cached text by more than just normalisation,
        // we still rebuild (a rare cross-edit scenario).
        if (cell.dataset.cellMode === 'raw' && document.activeElement === cell) {
          cell.dataset.cellText = incoming;
        } else {
          setCellText(cell, incoming);
        }
      }
      cell.dataset.row = String(this.row);
      cell.dataset.col = String(i);
      cell.dataset.tableFrom = String(this.tableFrom);
    }
    // Ensure the gear stays mounted on the first row even after a rebuild.
    if (this.isFirstRow && !dom.querySelector('.cm-table-style-gear')) {
      dom.appendChild(buildTableStyleGear(view, this.tableFrom));
    }
    if (!this.isFirstRow) {
      const oldGear = dom.querySelector('.cm-table-style-gear');
      if (oldGear) oldGear.remove();
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

function applyStyleVars(el: HTMLElement, style: TableStyle): void {
  const vars = styleToCssVars(style);
  // Always clear previously-set vars so a style reset doesn't leave
  // stale values behind on rebuilds.
  el.style.removeProperty('--durumi-table-top-rule');
  el.style.removeProperty('--durumi-table-header-separator');
  el.style.removeProperty('--durumi-table-row-rules');
  el.style.removeProperty('--durumi-table-vert-rules');
  el.style.removeProperty('--durumi-table-bottom-rule');
  el.style.removeProperty('--durumi-table-cell-pad');
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}

function tableStyleMetaEquals(a: TableStyleSerialized, b: TableStyleSerialized): boolean {
  if (a.source !== b.source) return false;
  return JSON.stringify(a.style) === JSON.stringify(b.style);
}

function buildTableStyleGear(view: EditorView, tableFrom: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cm-table-style-gear';
  btn.setAttribute('data-testid', 'table-style-gear');
  const label = t('table.style.gear');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.dataset.tableFrom = String(tableFrom);
  // Gear SVG (six-cog).
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '12');
  c.setAttribute('r', '3');
  svg.appendChild(c);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute(
    'd',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.16.66.42.88.74.22.32.34.7.34 1.09V12c0 .39-.12.77-.34 1.09-.22.32-.52.58-.88.74Z',
  );
  svg.appendChild(p);
  btn.appendChild(svg);
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openTableStylePopover(view, tableFrom, btn.getBoundingClientRect());
  });
  return btn;
}

/**
 * Read the canonical markdown source text for a cell.
 *
 * Phase 3.1.2: the cell's content may be EITHER a single raw text node
 * (focused / IME-active state) OR a tree of rendered inline-mark nodes
 * (`<strong>`, `<em>`, `<code>`, etc.) when blurred. To avoid having to
 * "un-render" the rendered DOM back to markdown source, we cache the
 * canonical text on `cell.dataset.cellText` and use that as the source
 * of truth at the DOM layer. The action-overlay child is structural and
 * has no bearing on the text content.
 */
function cellTextOnly(cell: HTMLElement): string {
  // If focused, the raw text in the DOM IS the source — read it directly
  // so in-progress edits (not yet synced) are visible to syncCell().
  if (cell.dataset.cellMode === 'raw' || cell.dataset.composing === 'true') {
    let s = '';
    for (let n = cell.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === Node.TEXT_NODE) s += (n as Text).data;
    }
    return s;
  }
  // Blurred — read the cached source. (Reading rendered DOM would strip
  // markers like `**` because `<strong>` only contains the inner text.)
  return cell.dataset.cellText ?? '';
}

/**
 * Set the cell's content. In `raw` mode this emits a single text node so
 * the user can edit literal markdown; in `rendered` mode this emits the
 * inline-marks DOM via the Phase 3.1.2 renderer.
 *
 * The Phase 3.2 hover-action overlay (`.cm-table-cell-actions-anchor`)
 * is preserved across content swaps — it's a structural sibling that
 * survives the children-replace path here.
 */
function setCellText(cell: HTMLElement, text: string): void {
  // Update the canonical source-of-truth cache first.
  cell.dataset.cellText = text;
  // Capture the overlay (if mounted) so we can re-attach after wiping.
  const overlay = cell.querySelector(':scope > .cm-table-cell-actions-anchor');
  // Remove every child that is not the overlay.
  const toRemove: Node[] = [];
  for (let n = cell.firstChild; n; n = n.nextSibling) {
    if (n !== overlay) toRemove.push(n);
  }
  for (const n of toRemove) cell.removeChild(n);
  // Insert new content BEFORE the overlay so the overlay stays last.
  const before = overlay ?? null;
  const mode = cell.dataset.cellMode ?? 'rendered';
  if (mode === 'raw') {
    if (text.length > 0) cell.insertBefore(document.createTextNode(text), before);
  } else {
    const frag = renderInlineMarksToDom(text, {
      onKatexReady: () => {
        // Re-render this cell on the next animation frame so the cache
        // hit picks up the rendered KaTeX HTML. Guarded by the dataset
        // check so an unmounted cell doesn't try to mutate stale DOM.
        const cellText = cell.dataset.cellText;
        if (cellText === undefined) return;
        if (cell.dataset.cellMode === 'raw') return;
        setCellText(cell, cellText);
      },
    });
    cell.insertBefore(frag, before);
  }
}

/**
 * Toggle a cell into raw editing mode and place the caret at the end of
 * the source text. The caller is expected to set focus on the cell first.
 */
function enterRawMode(cell: HTMLElement): void {
  if (cell.dataset.cellMode === 'raw') return;
  cell.dataset.cellMode = 'raw';
  const src = cell.dataset.cellText ?? '';
  setCellText(cell, src);
  // Place caret at the end of the text node so the user can immediately
  // resume editing. A finer "drop caret at click position" mapping is
  // possible but out of scope for Phase 3.1.2.
  const tn = cell.firstChild;
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      const offset = (tn as Text).length;
      range.setStart(tn, offset);
      range.setEnd(tn, offset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

/**
 * Swap back to rendered (blurred) mode. The latest source text is in
 * `dataset.cellText` (kept in sync by every input event).
 */
function exitRawMode(cell: HTMLElement): void {
  if (cell.dataset.cellMode !== 'raw') return;
  cell.dataset.cellMode = 'rendered';
  setCellText(cell, cell.dataset.cellText ?? '');
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
  c.dataset.cellMode = 'rendered';
  if (alignment && alignment !== 'default') c.style.textAlign = alignment;
  // Phase 3.1.2: render inline marks (`**bold**`, `$x$`, etc.) when the
  // cell is not focused; swap to raw markdown source on focus so editing
  // stays source-honest. The mode swap lives in enterRawMode/exitRawMode.
  setCellText(c, text);

  c.addEventListener('compositionstart', () => {
    c.dataset.composing = 'true';
  });
  c.addEventListener('compositionend', () => {
    delete c.dataset.composing;
    // During composition the DOM holds the raw text; sync it now.
    if (c.dataset.cellMode === 'raw') {
      c.dataset.cellText = readRawText(c);
    }
    syncCell(view, c);
  });
  c.addEventListener('input', () => {
    if (c.dataset.composing === 'true') return;
    // The cell is in raw mode whenever the user is typing (we forced
    // raw on focus). Keep the cached source in sync with the live DOM.
    if (c.dataset.cellMode === 'raw') {
      c.dataset.cellText = readRawText(c);
    }
    syncCell(view, c);
  });
  c.addEventListener('focus', () => {
    enterRawMode(c);
  });
  c.addEventListener('blur', () => {
    // Snap the cached source from the live DOM before re-rendering, in
    // case a late input arrived without firing our `input` listener.
    if (c.dataset.cellMode === 'raw') {
      c.dataset.cellText = readRawText(c);
    }
    exitRawMode(c);
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
  // Phase 3.2 — hover-triggered floating action overlay.
  attachCellHoverOverlay(c, view);
  return c;
}

/**
 * Read the raw text content of a cell that is currently in `raw` mode,
 * ignoring any structural children (e.g. the hover-action overlay).
 */
function readRawText(cell: HTMLElement): string {
  let s = '';
  for (let n = cell.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === Node.TEXT_NODE) s += (n as Text).data;
  }
  return s;
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
  // Use the text-only reader so the Phase 3.2 overlay (if mounted)
  // doesn't contribute to the cell's logical text.
  const cellText = cellTextOnly(cell);
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
  // In raw mode the cell's leading child is a text node; in rendered mode
  // the cell holds inline-mark elements (but blur fires before we hit
  // this path during normal editing).
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
      else if (!navigateNextCell(cell, view)) addRowOnTabOverflow(cell, view);
    }
    return;
  }
  if (ev.key === 'Tab') {
    ev.preventDefault();
    // Ensure any pending text is flushed before we move focus.
    syncCell(view, cell);
    if (ev.shiftKey) {
      navigatePrevCell(cell, view);
    } else {
      // Phase 3.2: Tab on the very last cell of the table adds a new
      // body row below and moves focus to its first cell (Typora-style).
      if (!navigateNextCell(cell, view)) addRowOnTabOverflow(cell, view);
    }
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
    const styleMeta = resolveTableStyle(state, t.from);
    // The "first row" is the first physical row (header). The gear icon
    // mounts there so it sits at the visual top-right of the table.
    let firstRowFlagSet = false;
    for (const r of t.rowLines) {
      // INVARIANT-DEVIATION (table-only): unlike every other block widget
      // we deliberately render even when the caret line intersects the
      // row. The widget is the editing surface; collapsing back to source
      // would break the contenteditable cell. See top-of-file doc and
      // CONTRIBUTING.md #11.
      const isFirstRow = !firstRowFlagSet && r.kind === 'header';
      if (isFirstRow) firstRowFlagSet = true;
      const widget = new TableRowWidget(
        t.from,
        t.to,
        r.logicalRow,
        r.cells,
        t.alignment,
        t.cols,
        r.kind,
        styleMeta,
        isFirstRow,
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
