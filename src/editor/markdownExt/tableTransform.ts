// Phase 3.2 — pure markdown-source transform helpers for table
// row/column add/delete operations.
//
// These functions take the markdown slice that the Lezer `Table` node
// spans (header line + delimiter line + 0..N body lines) and return a
// transformed slice. They have NO CodeMirror dependency so they can be
// driven by simple string fixtures in unit tests.
//
// --- Row index conventions ---
//
// `rowIndex` is the *logical* row index. Row 0 is the header. Row 1 and
// up are body rows. The delimiter line (`| --- | --- |`) is invisible
// to this index.
//
// --- Add semantics ---
//
// `addTableRow(src, 0, 'above')` is a no-op — the header MUST remain
// row 0 for the table to stay valid GFM. The helper instead returns the
// source unchanged. `addTableRow(src, 0, 'below')` inserts a new body
// row immediately after the delimiter (row 1 from the next call).
//
// --- Delete semantics ---
//
// `removeTableRow(src, 0)` is refused — markdown tables require a
// header row, so deleting it is treated as "no-op, returns src". If the
// caller wants to delete the only body row, that's allowed; the result
// is a 0-body table (header + delimiter only).
//
// Last-column delete is refused when only 1 column remains (returns
// src). Last-row delete is refused when only the header is left and
// the caller asks to delete it.
//
// --- Alignment preservation ---
//
// The separator row carries column alignment via `:---`, `:---:`,
// `---:` markers. Column add inserts a default `---` (left/no-align)
// at the new index; column delete simply drops the corresponding
// alignment marker, leaving the rest intact.
//
// --- Whitespace preservation ---
//
// We preserve the leading/trailing single space pattern around cell
// content (`| foo |`). The line-ending character is detected from the
// existing source (CRLF vs LF) and reused.

export interface TransformOptions {
  /** Override default cell text for newly added cells. Default: empty. */
  newCellText?: string;
}

const DELIM_CELL_RE = /^\s*:?-{3,}:?\s*$/;

/**
 * Split a row source into raw between-pipe cell strings (no escape
 * handling — these helpers don't need to interpret cell contents,
 * just preserve them byte-for-byte across structural edits).
 *
 * Returns the cells as an array of strings (including their padding
 * spaces). Leading and trailing pipes are consumed; if the row has
 * no outer pipes the helper still works.
 */
function splitRowRaw(row: string): { cells: string[]; leadingPipe: boolean; trailingPipe: boolean } {
  let s = row;
  let leadingPipe = false;
  let trailingPipe = false;
  // Allow leading whitespace before the pipe.
  const lead = s.match(/^(\s*)\|/);
  if (lead) {
    leadingPipe = true;
    s = s.slice(lead[0].length);
  }
  const trail = s.match(/\|(\s*)$/);
  if (trail) {
    trailingPipe = true;
    s = s.slice(0, s.length - trail[0].length);
  }
  // Escape-aware split on `|`.
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '|') {
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && s[j] === '\\') {
        bs++;
        j--;
      }
      if (bs % 2 === 0) {
        cells.push(buf);
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  cells.push(buf);
  return { cells, leadingPipe, trailingPipe };
}

function joinRow(cells: string[], leadingPipe: boolean, trailingPipe: boolean): string {
  let s = cells.join('|');
  if (leadingPipe) s = '|' + s;
  if (trailingPipe) s = s + '|';
  return s;
}

interface ParsedTable {
  lines: string[];
  lineEnding: string;
  headerIdx: number;
  delimIdx: number;
  bodyIdx: number[];
  /** Trailing newline of the source — preserved on output. */
  trailingNewline: string;
}

function parseTable(src: string): ParsedTable | null {
  // Detect line ending.
  const crlf = src.includes('\r\n');
  const lineEnding = crlf ? '\r\n' : '\n';
  // Capture trailing newline so we can restore it.
  let trailingNewline = '';
  let body = src;
  if (body.endsWith('\r\n')) {
    trailingNewline = '\r\n';
    body = body.slice(0, -2);
  } else if (body.endsWith('\n')) {
    trailingNewline = '\n';
    body = body.slice(0, -1);
  }
  const rawLines = body.split(/\r?\n/);
  // Locate delimiter row.
  let delimIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    if (ln === undefined) continue;
    const stripped = ln.trim().replace(/^\|/, '').replace(/\|$/, '');
    if (stripped.length === 0) continue;
    const parts = stripped.split('|');
    if (parts.length > 0 && parts.every((p) => DELIM_CELL_RE.test(p))) {
      delimIdx = i;
      break;
    }
  }
  if (delimIdx === -1) return null;
  // Header is the line immediately before delimiter; body is everything
  // after (only rows that contain a `|`).
  let headerIdx = delimIdx - 1;
  while (headerIdx >= 0 && !(rawLines[headerIdx] ?? '').includes('|')) headerIdx--;
  if (headerIdx < 0) return null;
  const bodyIdx: number[] = [];
  for (let i = delimIdx + 1; i < rawLines.length; i++) {
    if ((rawLines[i] ?? '').includes('|')) bodyIdx.push(i);
  }
  return {
    lines: rawLines,
    lineEnding,
    headerIdx,
    delimIdx,
    bodyIdx,
    trailingNewline,
  };
}

function makeBlankCellPadded(text: string): string {
  // Canonical padded cell: ` <text> ` with single space either side.
  // Empty becomes three spaces so the row still has visual width — that
  // matches the convention used by `replaceCellText`.
  return text.length === 0 ? '   ' : ' ' + text + ' ';
}

function newRowFor(cols: number, text: string): { cells: string[] } {
  const cell = makeBlankCellPadded(text);
  const out = new Array<string>(cols).fill(cell);
  return { cells: out };
}

function colCount(parsed: ParsedTable): number {
  const headerCells = splitRowRaw(parsed.lines[parsed.headerIdx] ?? '').cells;
  return headerCells.length;
}

/**
 * Insert a new row above or below the row at logical `rowIndex`.
 *
 * Logical indexing: 0 = header, 1+ = body rows in document order.
 *
 * Rules:
 *  - `rowIndex === 0 && where === 'above'` is a no-op (header invariant).
 *  - `rowIndex === 0 && where === 'below'` inserts a new body row
 *    immediately after the delimiter — i.e. the new row becomes
 *    logical row 1.
 *  - Otherwise the new row is inserted relative to the existing body
 *    row at `rowIndex`.
 */
export function addTableRow(
  tableMarkdown: string,
  rowIndex: number,
  where: 'above' | 'below',
  opts: TransformOptions = {},
): string {
  const p = parseTable(tableMarkdown);
  if (!p) return tableMarkdown;
  if (rowIndex < 0) return tableMarkdown;
  if (rowIndex === 0 && where === 'above') return tableMarkdown;
  const cols = colCount(p);
  const text = opts.newCellText ?? '';
  const { cells } = newRowFor(cols, text);
  const headerInfo = splitRowRaw(p.lines[p.headerIdx] ?? '');
  const newLine = joinRow(cells, headerInfo.leadingPipe, headerInfo.trailingPipe);
  // Resolve insertion *physical* index in `p.lines`.
  let insertPhysical: number;
  if (rowIndex === 0 && where === 'below') {
    // Insert right after the delimiter (so it becomes body row 0 in
    // the visual order; logical row 1).
    insertPhysical = p.delimIdx + 1;
  } else {
    // rowIndex is a body row index ≥ 1.
    const bodyArrayIdx = rowIndex - 1;
    if (bodyArrayIdx < 0 || bodyArrayIdx >= p.bodyIdx.length) {
      // Out of range — append to end as a safe fallback.
      insertPhysical = p.lines.length;
    } else {
      const target = p.bodyIdx[bodyArrayIdx] ?? p.lines.length;
      insertPhysical = where === 'above' ? target : target + 1;
    }
  }
  const out = [...p.lines];
  out.splice(insertPhysical, 0, newLine);
  return out.join(p.lineEnding) + p.trailingNewline;
}

/**
 * Insert a new column to the left or right of column `colIndex`.
 *
 * Every row (header + delimiter + body) is extended. The new
 * delimiter cell defaults to `---` (left/no alignment).
 */
export function addTableColumn(
  tableMarkdown: string,
  colIndex: number,
  where: 'left' | 'right',
  opts: TransformOptions = {},
): string {
  const p = parseTable(tableMarkdown);
  if (!p) return tableMarkdown;
  const cols = colCount(p);
  if (colIndex < 0) colIndex = 0;
  if (colIndex > cols - 1) colIndex = cols - 1;
  const insertAt = where === 'left' ? colIndex : colIndex + 1;
  const text = opts.newCellText ?? '';
  const newCell = makeBlankCellPadded(text);
  const newDelim = ' --- ';
  const out = p.lines.map((line, i) => {
    if (i === p.delimIdx) {
      const info = splitRowRaw(line);
      const cells = [...info.cells];
      // Clamp insertAt to current cell length for malformed rows.
      const at = Math.min(insertAt, cells.length);
      cells.splice(at, 0, newDelim);
      return joinRow(cells, info.leadingPipe, info.trailingPipe);
    }
    if (i === p.headerIdx || p.bodyIdx.includes(i)) {
      const info = splitRowRaw(line);
      const cells = [...info.cells];
      const at = Math.min(insertAt, cells.length);
      cells.splice(at, 0, newCell);
      return joinRow(cells, info.leadingPipe, info.trailingPipe);
    }
    return line;
  });
  return out.join(p.lineEnding) + p.trailingNewline;
}

/**
 * Remove a row by logical index.
 *
 * `rowIndex === 0` (header) is refused — returns src unchanged.
 * Removing the only remaining body row leaves a header+delimiter
 * skeleton (still valid GFM).
 */
export function removeTableRow(tableMarkdown: string, rowIndex: number): string {
  const p = parseTable(tableMarkdown);
  if (!p) return tableMarkdown;
  if (rowIndex <= 0) return tableMarkdown;
  const bodyArrayIdx = rowIndex - 1;
  if (bodyArrayIdx < 0 || bodyArrayIdx >= p.bodyIdx.length) return tableMarkdown;
  const removeAt = p.bodyIdx[bodyArrayIdx];
  if (removeAt === undefined) return tableMarkdown;
  const out = [...p.lines];
  out.splice(removeAt, 1);
  return out.join(p.lineEnding) + p.trailingNewline;
}

/**
 * Remove a column from the table.
 *
 * Refuses if the table only has 1 column (header is required, and a
 * 0-column table is invalid GFM).
 */
export function removeTableColumn(tableMarkdown: string, colIndex: number): string {
  const p = parseTable(tableMarkdown);
  if (!p) return tableMarkdown;
  const cols = colCount(p);
  if (cols <= 1) return tableMarkdown;
  if (colIndex < 0 || colIndex >= cols) return tableMarkdown;
  const out = p.lines.map((line, i) => {
    if (i === p.delimIdx || i === p.headerIdx || p.bodyIdx.includes(i)) {
      const info = splitRowRaw(line);
      const cells = [...info.cells];
      if (colIndex < cells.length) cells.splice(colIndex, 1);
      return joinRow(cells, info.leadingPipe, info.trailingPipe);
    }
    return line;
  });
  return out.join(p.lineEnding) + p.trailingNewline;
}

// Test-only exports.
export const _internalForTest = {
  parseTable,
  splitRowRaw,
  joinRow,
};
