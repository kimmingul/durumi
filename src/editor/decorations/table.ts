import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { getActiveLineRange } from './activeLine';
import { isWysiwygMode } from '../editMode';
import { getCachedInline, isInlineInflight, requestRenderInline } from '../markdownExt/inlineMarkdownRenderer';

const renderTick = StateEffect.define<number>();
let tickCounter = 0;

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

class TableRowWidget extends WidgetType {
  constructor(
    readonly cells: string[],
    readonly alignment: Alignment[],
    readonly cols: string,
    readonly kind: 'header' | 'delimiter' | 'body',
  ) {
    super();
  }
  eq(other: TableRowWidget) {
    return (
      other.kind === this.kind &&
      other.cols === this.cols &&
      other.cells.length === this.cells.length &&
      other.cells.every((c, i) => c === this.cells[i]) &&
      other.alignment.every((a, i) => a === this.alignment[i])
    );
  }
  toDOM() {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'cm-table-row cm-table-row-' + this.kind;
    row.style.setProperty('--cm-table-cols', this.cols);
    if (this.kind === 'delimiter') {
      for (let i = 0; i < this.alignment.length; i++) {
        const c = document.createElement('div');
        c.className = 'cm-table-cell cm-table-delim';
        row.appendChild(c);
      }
      return row;
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = document.createElement('div');
      c.setAttribute('role', 'cell');
      c.className = 'cm-table-cell';
      const align = this.alignment[i] ?? 'default';
      if (align !== 'default') c.style.textAlign = align;
      // markdown-it (configured with html:false) is dynamic-imported via
      // `inlineMarkdownRenderer`. Until the lazy chunk loads, the cell shows
      // the raw text — once cached, a `renderTick` rebuilds the widget with
      // the formatted HTML.
      const html = getCachedInline(this.cells[i]);
      if (html !== null) {
        injectCellHtml(c, html);
      } else {
        c.textContent = this.cells[i];
      }
      row.appendChild(c);
    }
    return row;
  }
  ignoreEvent() {
    return false;
  }
}

interface TableInfo {
  from: number;
  to: number;
  rowLines: { line: number; from: number; to: number; cells: string[]; kind: 'header' | 'delimiter' | 'body' }[];
  alignment: Alignment[];
  cols: string;
}

function splitCells(rowText: string): string[] {
  const t = rowText.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
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
      // Iterate immediate children of the Table node (TableHeader, TableDelimiter, TableRow)
      const child = node.node.firstChild;
      let c = child;
      while (c) {
        const text = state.sliceDoc(c.from, c.to);
        // Only treat children that have pipe characters or match the delimiter pattern as table rows.
        const looksLikeRow = text.includes('|');
        const looksLikeDelim = DELIM_RE.test(text.trim());
        if (c.name === 'TableHeader' && looksLikeRow) {
          const lineNum = state.doc.lineAt(c.from).number;
          const cells = splitCells(text);
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells, kind: 'header' });
          cellsByRow.push(cells);
        } else if (c.name === 'TableDelimiter' && looksLikeDelim) {
          // Top-level delimiter that spans the alignment line (not the single-pipe inline delimiters)
          alignment = parseAlignment(text);
          const lineNum = state.doc.lineAt(c.from).number;
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells: [], kind: 'delimiter' });
        } else if (c.name === 'TableRow' && looksLikeRow) {
          const lineNum = state.doc.lineAt(c.from).number;
          const cells = splitCells(text);
          rowLines.push({ line: lineNum, from: c.from, to: c.to, cells, kind: 'body' });
          cellsByRow.push(cells);
        }
        c = c.nextSibling;
      }
      const cols = computeColWidths(cellsByRow);
      out.push({ from: tableFrom, to: tableTo, rowLines, alignment, cols });
    },
  });
  return out;
}

function build(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tables = collectTables(state);
  const active = getActiveLineRange(state);
  const wysiwyg = isWysiwygMode(state);
  for (const t of tables) {
    for (const r of t.rowLines) {
      const lineActive = !(r.to < active.from || r.from > active.to);
      if (!wysiwyg && lineActive) continue;
      const widget = new TableRowWidget(r.cells, t.alignment, t.cols, r.kind);
      builder.add(r.from, r.to, Decoration.replace({ widget, block: true }));
    }
  }
  return builder.finish();
}

function injectCellHtml(host: HTMLElement, html: string): void {
  // Trust boundary: markdown-it configured with html:false; renderInline
  // escapes user HTML before producing inline-safe markup. Same boundary as
  // mermaid/katex widget rendering.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = host as any;
  h.innerHTML = html;
}

const tableField = StateField.define<DecorationSet>({
  create(state) {
    return build(state);
  },
  update(value, tr) {
    let rebuild = tr.docChanged || tr.selection;
    if (!rebuild) {
      for (const e of tr.effects) {
        if (e.is(renderTick)) {
          rebuild = true;
          break;
        }
      }
    }
    if (rebuild) return build(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const tableLoader = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.scan(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.scan(u.view);
    }
    scan(view: EditorView) {
      // Walk all cell texts in the document. Most docs have no tables, so
      // this is a one-pass scan that exits early. When a cell is not cached,
      // request it; once the renderer resolves, dispatch a tick so the
      // StateField rebuilds with the freshly-formatted output.
      const tables = collectTables(view.state);
      const pending: string[] = [];
      for (const t of tables) {
        for (const r of t.rowLines) {
          for (const cell of r.cells) {
            if (getCachedInline(cell) !== null) continue;
            if (isInlineInflight(cell)) continue;
            pending.push(cell);
          }
        }
      }
      if (pending.length === 0) return;
      // De-dup; same cell text in multiple rows is common in typical tables.
      const unique = Array.from(new Set(pending));
      void Promise.all(unique.map((c) => requestRenderInline(c))).then(() => {
        if ((view as unknown as { destroyed?: boolean }).destroyed) return;
        view.dispatch({ effects: renderTick.of(++tickCounter) });
      });
    }
  },
);

export function tableDecoration(): Extension {
  return [tableField, tableLoader];
}
