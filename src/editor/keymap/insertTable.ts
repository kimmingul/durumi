import type { EditorView } from '@codemirror/view';

const DEFAULT_ROWS = 2;
const DEFAULT_COLS = 2;
const HEADER_OFFSET = 2; // skip "| " in the first row
const HEADER_LEN = 'Header 1'.length;

/**
 * Build a GFM table boilerplate of `rows x cols` cells. The first row is the
 * header; the rest are data rows. Cell contents are padded so the markdown
 * source columns visually line up in the editor — a small touch but it makes
 * a freshly-inserted table feel polished.
 *
 * `rows < 2` is clamped to 2 (header + at least one data row) so the result
 * is always a syntactically valid GFM table. `cols < 1` is clamped to 1.
 */
function buildTable(rows: number, cols: number): string {
  const r = Math.max(2, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  // Column width = max of header label ("Header N") and "Cell N". For N up
  // to 10 the longer is always "Header NN" (9 chars for one-digit, 10 for
  // two-digit). Pad each cell to that width so the source stays aligned.
  const colWidth = (i: number): number => Math.max(`Header ${i}`.length, `Cell ${i}`.length);
  const widths: number[] = [];
  for (let i = 1; i <= c; i += 1) widths.push(colWidth(i));
  const headerCells: string[] = [];
  const sepCells: string[] = [];
  for (let i = 1; i <= c; i += 1) {
    headerCells.push(`Header ${i}`.padEnd(widths[i - 1]!, ' '));
    sepCells.push('-'.repeat(widths[i - 1]!));
  }
  const dataRow = (idx: number): string => {
    const cells: string[] = [];
    for (let i = 1; i <= c; i += 1) {
      cells.push(`Cell ${idx + (i - 1)}`.padEnd(widths[i - 1]!, ' '));
    }
    return `| ${cells.join(' | ')} |`;
  };
  const lines: string[] = [];
  lines.push(`| ${headerCells.join(' | ')} |`);
  lines.push(`| ${sepCells.join(' | ')} |`);
  for (let i = 0; i < r - 1; i += 1) lines.push(dataRow(1 + i * c));
  return `${lines.join('\n')}\n`;
}

/**
 * Insert a GFM markdown table at the selection.
 *
 * With no `rows`/`cols` args the historical 2x2 shape is produced — important
 * because existing menu commands, keymap entries, and unit tests all expect
 * exactly that boilerplate. The toolbar's hover-grid picker passes explicit
 * `rows`/`cols` to get any shape up to 10x10.
 *
 * After insertion the caret selects the first header cell's text ("Header 1")
 * so the user can immediately rename it.
 */
export function insertTable(view: EditorView, rows = DEFAULT_ROWS, cols = DEFAULT_COLS): boolean {
  const { from, to } = view.state.selection.main;
  const insert = buildTable(rows, cols);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + HEADER_OFFSET, head: from + HEADER_OFFSET + HEADER_LEN },
  });
  return true;
}
